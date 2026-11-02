// ไฟล์นี้มีแต่ฟังก์ชันล้วน ๆ: ไม่แตะหน้าเว็บและไม่ยิงเน็ต
// ใส่ค่าเดิมได้ผลเดิมเสมอ จึงเขียน test ได้โดยไม่ต้องเปิดเบราว์เซอร์

const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search';

const CURRENT_FIELDS = [
  'temperature_2m',
  'relative_humidity_2m',
  'apparent_temperature',
  'precipitation',
  'weather_code',
  'wind_speed_10m',
  'is_day',
];

// รหัสอากาศมาตรฐาน WMO ที่ Open-Meteo ส่งมา
const WEATHER_CODES = {
  0: { text: 'ท้องฟ้าแจ่มใส', day: '☀️', night: '🌙' },
  1: { text: 'แจ่มใสเป็นส่วนใหญ่', day: '🌤️', night: '🌙' },
  2: { text: 'มีเมฆบางส่วน', day: '⛅', night: '☁️' },
  3: { text: 'เมฆมาก', day: '☁️', night: '☁️' },
  45: { text: 'มีหมอก', day: '🌫️', night: '🌫️' },
  48: { text: 'หมอกน้ำค้างแข็ง', day: '🌫️', night: '🌫️' },
  51: { text: 'ฝนละอองเล็กน้อย', day: '🌦️', night: '🌧️' },
  53: { text: 'ฝนละออง', day: '🌦️', night: '🌧️' },
  55: { text: 'ฝนละอองหนาแน่น', day: '🌧️', night: '🌧️' },
  56: { text: 'ฝนละอองเยือกแข็งเล็กน้อย', day: '🌧️', night: '🌧️' },
  57: { text: 'ฝนละอองเยือกแข็งหนาแน่น', day: '🌧️', night: '🌧️' },
  61: { text: 'ฝนตกเล็กน้อย', day: '🌦️', night: '🌧️' },
  63: { text: 'ฝนตกปานกลาง', day: '🌧️', night: '🌧️' },
  65: { text: 'ฝนตกหนัก', day: '🌧️', night: '🌧️' },
  66: { text: 'ฝนเยือกแข็งเล็กน้อย', day: '🌧️', night: '🌧️' },
  67: { text: 'ฝนเยือกแข็งหนัก', day: '🌧️', night: '🌧️' },
  71: { text: 'หิมะตกเล็กน้อย', day: '🌨️', night: '🌨️' },
  73: { text: 'หิมะตกปานกลาง', day: '🌨️', night: '🌨️' },
  75: { text: 'หิมะตกหนัก', day: '❄️', night: '❄️' },
  77: { text: 'เกล็ดหิมะ', day: '🌨️', night: '🌨️' },
  80: { text: 'ฝนซู่เล็กน้อย', day: '🌦️', night: '🌧️' },
  81: { text: 'ฝนซู่ปานกลาง', day: '🌧️', night: '🌧️' },
  82: { text: 'ฝนซู่รุนแรง', day: '⛈️', night: '⛈️' },
  85: { text: 'หิมะซู่เล็กน้อย', day: '🌨️', night: '🌨️' },
  86: { text: 'หิมะซู่หนัก', day: '❄️', night: '❄️' },
  95: { text: 'พายุฝนฟ้าคะนอง', day: '⛈️', night: '⛈️' },
  96: { text: 'พายุฝนฟ้าคะนองและลูกเห็บ', day: '⛈️', night: '⛈️' },
  99: { text: 'พายุฝนฟ้าคะนองและลูกเห็บรุนแรง', day: '⛈️', night: '⛈️' },
};

export function buildForecastUrl(latitude, longitude) {
  const params = new URLSearchParams({
    latitude,
    longitude,
    current: CURRENT_FIELDS.join(','),
    timezone: 'auto',
  });
  return `${FORECAST_URL}?${params}`;
}

export function buildGeocodingUrl(name) {
  const params = new URLSearchParams({
    name,
    count: 5,
    language: 'th',
    format: 'json',
  });
  return `${GEOCODING_URL}?${params}`;
}

export function describeWeather(code, isDay) {
  const entry = WEATHER_CODES[code];
  if (!entry) return { text: 'ไม่ทราบสภาพอากาศ', icon: '❔' };
  return { text: entry.text, icon: isDay ? entry.day : entry.night };
}

// เลือกพื้นหลังตามอากาศ ค่าที่ได้ไปตรงกับ body[data-sky="..."] ใน style.css
// ฝน พายุ และหิมะใช้สีเดียวทั้งวัน ส่วนฟ้าโล่งกับเมฆมากต้องแยกกลางวันกลางคืน
export function skyFor(code, isDay) {
  if (!WEATHER_CODES[code]) return 'neutral';
  if (code >= 95) return 'storm';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if (code >= 51) return 'rain';
  if (code === 3 || code === 45 || code === 48) return isDay ? 'cloudy' : 'cloudy-night';
  return isDay ? 'clear' : 'night';
}

// แปลงคำตอบของ API เป็นชื่อที่เราใช้ในแอป ถ้า API เปลี่ยนรูปแบบ จะแก้ที่จุดนี้จุดเดียว
export function parseForecast(json) {
  const current = json?.current;
  if (!Number.isFinite(current?.temperature_2m)) {
    throw new Error('Forecast response has no current temperature');
  }
  return {
    temperature: current.temperature_2m,
    feelsLike: current.apparent_temperature,
    humidity: current.relative_humidity_2m,
    precipitation: current.precipitation,
    windSpeed: current.wind_speed_10m,
    code: current.weather_code,
    // ถ้าไม่มีค่านี้ให้ถือเป็นกลางวัน จะสรุปว่าเป็นกลางคืนต่อเมื่อ API บอกมาชัด ๆ เท่านั้น
    isDay: current.is_day !== 0,
    observedAt: current.time,
    intervalSeconds: current.interval,
  };
}

// ถ้าค้นไม่เจอ API จะไม่ส่ง results มาเลย ไม่ใช่ส่ง array ว่าง
export function parsePlaces(json) {
  return (json?.results ?? [])
    // ผลที่ไม่มีชื่อหรือพิกัดเอาไปใช้ต่อไม่ได้ จึงตัดออกตั้งแต่ตรงนี้
    .filter(
      (result) =>
        result.name && Number.isFinite(result.latitude) && Number.isFinite(result.longitude),
    )
    .map((result) => ({
      name: result.name,
      label: [result.admin1, result.country].filter(Boolean).join(', '),
      latitude: result.latitude,
      longitude: result.longitude,
    }));
}

// ข้อมูลใน localStorage อาจเสียหรือเป็นรูปแบบเก่า เลยต้องตรวจก่อนใช้เสมอ
export function parseSavedPlace(raw) {
  try {
    const place = JSON.parse(raw);
    const isValid =
      typeof place?.name === 'string' &&
      Number.isFinite(place.latitude) &&
      Number.isFinite(place.longitude);
    return isValid ? place : null;
  } catch {
    return null;
  }
}

export function formatValue(value, unit, digits = 0) {
  if (!Number.isFinite(value)) return '–';
  // (-0.4).toFixed(0) ได้ "-0" จึงต้องแปลงกลับเป็นเลขก่อน ไม่งั้นจะแสดง -0°
  const rounded = Number(value.toFixed(digits));
  return `${(rounded === 0 ? 0 : rounded).toFixed(digits)}${unit}`;
}

// API ส่งเวลาท้องถิ่นของเมืองนั้นมาแบบ "2026-11-02T15:00" ไม่มี timezone
// ถ้าส่งเข้า new Date() มันจะถูกตีความเป็นเวลาของเครื่องเรา เลยตัดข้อความเอาตรง ๆ
export function formatLocalTime(isoTime) {
  return typeof isoTime === 'string' ? isoTime.slice(11, 16) : '–';
}

// interval คือความยาวของช่วงข้อมูล ไม่ใช่รอบที่ได้ข้อมูลใหม่ จึงห้ามเขียนว่า "อัปเดตทุก"
// ต้องเช็กก่อนหาร เพราะ null / 60 ได้ 0 แล้วจะขึ้นว่า "0 นาที"
export function formatDataTime(isoTime, intervalSeconds) {
  const time = `ข้อมูลเวลา ${formatLocalTime(isoTime)} น. ตามเวลาท้องถิ่น`;
  if (!Number.isFinite(intervalSeconds)) return time;
  return `${time}\nข้อมูลแบ่งช่วงละ ${formatValue(intervalSeconds / 60, ' นาที')}`;
}
