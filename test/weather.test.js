import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildForecastUrl,
  buildGeocodingUrl,
  describeWeather,
  formatDataTime,
  formatLocalTime,
  formatValue,
  parseForecast,
  parsePlaces,
  parseSavedPlace,
  skyFor,
} from '../js/weather.js';

describe('buildForecastUrl', () => {
  it('asks for current weather at the given coordinates in local time', () => {
    const url = new URL(buildForecastUrl(13.75, 100.5));

    assert.equal(url.searchParams.get('latitude'), '13.75');
    assert.equal(url.searchParams.get('longitude'), '100.5');
    assert.equal(url.searchParams.get('timezone'), 'auto');
    assert.equal(
      url.searchParams.get('current'),
      'temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,is_day',
    );
  });
});

describe('buildGeocodingUrl', () => {
  it('keeps a Thai city name intact after URL encoding', () => {
    const url = new URL(buildGeocodingUrl('เชียงใหม่'));

    assert.equal(url.searchParams.get('name'), 'เชียงใหม่');
    assert.equal(url.searchParams.get('language'), 'th');
  });

  it('cannot be tricked into adding extra parameters', () => {
    const url = new URL(buildGeocodingUrl('a&count=999'));

    assert.equal(url.searchParams.get('name'), 'a&count=999');
    assert.equal(url.searchParams.get('count'), '5');
  });
});

describe('describeWeather', () => {
  it('uses a different icon for clear sky at day and night', () => {
    assert.deepEqual(describeWeather(0, true), { text: 'ท้องฟ้าแจ่มใส', icon: '☀️' });
    assert.deepEqual(describeWeather(0, false), { text: 'ท้องฟ้าแจ่มใส', icon: '🌙' });
  });

  it('does not crash on a code it does not know', () => {
    assert.equal(describeWeather(1234, true).text, 'ไม่ทราบสภาพอากาศ');
  });
});

describe('skyFor', () => {
  it('uses the day and night skies for clear weather', () => {
    assert.equal(skyFor(0, true), 'clear');
    assert.equal(skyFor(2, true), 'clear');
    assert.equal(skyFor(0, false), 'night');
    assert.equal(skyFor(2, false), 'night');
  });

  it('does not show a starry night when the sky is overcast or foggy', () => {
    assert.equal(skyFor(3, true), 'cloudy');
    assert.equal(skyFor(45, true), 'cloudy');
    assert.equal(skyFor(3, false), 'cloudy-night');
    assert.equal(skyFor(48, false), 'cloudy-night');
  });

  it('uses the rain sky for every kind of rain, day or night', () => {
    for (const code of [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82]) {
      assert.equal(skyFor(code, true), 'rain', `code ${code}`);
      assert.equal(skyFor(code, false), 'rain', `code ${code}`);
    }
  });

  it('uses the snow sky for every kind of snow', () => {
    for (const code of [71, 73, 75, 77, 85, 86]) {
      assert.equal(skyFor(code, true), 'snow', `code ${code}`);
    }
  });

  it('uses the storm sky for thunderstorms', () => {
    for (const code of [95, 96, 99]) {
      assert.equal(skyFor(code, true), 'storm', `code ${code}`);
    }
  });

  it('falls back to neutral for an unknown code', () => {
    assert.equal(skyFor(1234, true), 'neutral');
    assert.equal(skyFor(null, true), 'neutral');
  });
});

describe('parseForecast', () => {
  const response = {
    current: {
      time: '2026-11-02T15:00',
      interval: 900,
      temperature_2m: 34.6,
      relative_humidity_2m: 47,
      apparent_temperature: 39.3,
      precipitation: 0,
      weather_code: 1,
      wind_speed_10m: 0.9,
      is_day: 1,
    },
  };

  it('maps API field names to app field names', () => {
    assert.deepEqual(parseForecast(response), {
      temperature: 34.6,
      feelsLike: 39.3,
      humidity: 47,
      precipitation: 0,
      windSpeed: 0.9,
      code: 1,
      isDay: true,
      observedAt: '2026-11-02T15:00',
      intervalSeconds: 900,
    });
  });

  it('treats is_day 0 as night', () => {
    const night = { current: { ...response.current, is_day: 0 } };

    assert.equal(parseForecast(night).isDay, false);
  });

  it('does not assume night when is_day is missing', () => {
    const unknown = { current: { ...response.current, is_day: null } };

    assert.equal(parseForecast(unknown).isDay, true);
  });

  it('accepts a temperature of exactly 0', () => {
    const freezing = { current: { ...response.current, temperature_2m: 0 } };

    assert.equal(parseForecast(freezing).temperature, 0);
  });

  it('throws instead of showing an empty result when data is missing', () => {
    assert.throws(() => parseForecast({}));
    assert.throws(() => parseForecast(null));
    assert.throws(() => parseForecast({ current: { temperature_2m: null } }));
  });
});

describe('parsePlaces', () => {
  it('returns an empty list when the API omits results', () => {
    assert.deepEqual(parsePlaces({ generationtime_ms: 0.1 }), []);
  });

  it('builds a label and skips missing parts', () => {
    const places = parsePlaces({
      results: [
        { name: 'A', admin1: 'จังหวัด', country: 'ไทย', latitude: 1, longitude: 2 },
        { name: 'B', country: 'ไทย', latitude: 3, longitude: 4 },
      ],
    });

    assert.deepEqual(places[0], {
      name: 'A',
      label: 'จังหวัด, ไทย',
      latitude: 1,
      longitude: 2,
    });
    assert.equal(places[1].label, 'ไทย');
  });

  it('removes results without a name or coordinates', () => {
    const places = parsePlaces({
      results: [
        { latitude: 1, longitude: 2 },
        { name: 'No latitude', longitude: 2 },
        { name: 'No longitude', latitude: 1 },
        { name: 'Good', latitude: 0, longitude: 0 },
      ],
    });

    assert.deepEqual(places.map((place) => place.name), ['Good']);
  });
});

describe('parseSavedPlace', () => {
  it('restores a valid saved place', () => {
    const place = { name: 'A', label: 'B', latitude: 1, longitude: 2 };

    assert.deepEqual(parseSavedPlace(JSON.stringify(place)), place);
  });

  it('accepts coordinates of 0', () => {
    const place = { name: 'Null Island', label: '', latitude: 0, longitude: 0 };

    assert.deepEqual(parseSavedPlace(JSON.stringify(place)), place);
  });

  it('returns null for missing, broken or wrongly shaped data', () => {
    assert.equal(parseSavedPlace(null), null);
    assert.equal(parseSavedPlace('{broken'), null);
    assert.equal(parseSavedPlace('{"name":"A"}'), null);
    assert.equal(parseSavedPlace('{"name":"A","latitude":"1","longitude":2}'), null);
    assert.equal(parseSavedPlace('{"name":"A","latitude":1}'), null);
    assert.equal(parseSavedPlace('{"latitude":1,"longitude":2}'), null);
  });
});

describe('formatValue', () => {
  it('rounds and adds the unit', () => {
    assert.equal(formatValue(34.6, '°C'), '35°C');
    assert.equal(formatValue(0.25, ' มม.', 1), '0.3 มม.');
  });

  it('never shows negative zero', () => {
    assert.equal(formatValue(-0.4, '°C'), '0°C');
  });

  it('keeps real negative temperatures', () => {
    assert.equal(formatValue(-5.6, '°C'), '-6°C');
  });

  it('shows a dash when the value is missing', () => {
    assert.equal(formatValue(null, '°C'), '–');
    assert.equal(formatValue(undefined, '%'), '–');
  });
});

describe('formatLocalTime', () => {
  it('returns the location time without converting it', () => {
    assert.equal(formatLocalTime('2026-11-02T15:00'), '15:00');
  });

  it('shows a dash when the time is missing', () => {
    assert.equal(formatLocalTime(undefined), '–');
  });
});

describe('formatDataTime', () => {
  it('shows the location time and the length of the data period', () => {
    assert.equal(
      formatDataTime('2026-11-02T15:00', 900),
      'ข้อมูลเวลา 15:00 น. ตามเวลาท้องถิ่น\nข้อมูลแบ่งช่วงละ 15 นาที',
    );
  });

  it('leaves out the period instead of showing 0 minutes when it is missing', () => {
    assert.equal(
      formatDataTime('2026-11-02T15:00', null),
      'ข้อมูลเวลา 15:00 น. ตามเวลาท้องถิ่น',
    );
  });
});
