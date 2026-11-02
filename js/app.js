// ไฟล์นี้เชื่อมทุกอย่างเข้ากับหน้าเว็บ: ยิง API, แสดงผล, รับการกดปุ่ม

import {
  buildForecastUrl,
  buildGeocodingUrl,
  describeWeather,
  formatDataTime,
  formatValue,
  parseForecast,
  parsePlaces,
  parseSavedPlace,
  skyFor,
} from './weather.js';

const REFRESH_MS = 5 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 10 * 1000;
const STORAGE_KEY = 'spoon-weather:place';
const DEFAULT_PLACE = {
  name: 'กรุงเทพมหานคร',
  label: 'ไทย',
  latitude: 13.754,
  longitude: 100.501,
};

const byId = (id) => document.getElementById(id);
const ui = {
  searchForm: byId('search-form'),
  searchInput: byId('search-input'),
  searchResults: byId('search-results'),
  searchStatus: byId('search-status'),
  locateButton: byId('locate-button'),
  weatherStatus: byId('weather-status'),
  placeName: byId('place-name'),
  placeDetail: byId('place-detail'),
  icon: byId('weather-icon'),
  temperature: byId('temperature'),
  condition: byId('condition'),
  feelsLike: byId('feels-like'),
  humidity: byId('humidity'),
  wind: byId('wind'),
  precipitation: byId('precipitation'),
  updated: byId('updated'),
  refreshButton: byId('refresh-button'),
};

let currentPlace = DEFAULT_PLACE;
let hasWeather = false;
let lastCheckedAt = 0;
let latestRefreshId = 0;
// นับทุกการกระทำที่เกี่ยวกับการเลือกเมือง: ค้นหา, หาตำแหน่ง, เลือกเมือง
// คำตอบที่มาช้าจากการกระทำเก่าจะมีเลขไม่ตรง และถูกทิ้งไป
let latestPlaceActionId = 0;

// แยกช่องข้อความเป็น 2 ช่อง: ค้นหา/ตำแหน่ง กับข้อมูลอากาศ
// งานหนึ่งจะได้ไม่ไปลบข้อความของอีกงาน เช่น ค้นเมืองสำเร็จแล้วคำเตือนว่าข้อมูลเก่าหายไป
function setStatus(element, message) {
  element.textContent = message;
  element.hidden = message === '';
}

async function fetchJson(url) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function renderPlace(place) {
  ui.placeName.textContent = place.name;
  ui.placeDetail.textContent = place.label;
}

// ล้างค่าเก่าตอนเปลี่ยนเมือง ไม่งั้นถ้าโหลดเมืองใหม่พัง จะเห็นอากาศเมืองเก่าใต้ชื่อเมืองใหม่
// พื้นหลังก็ต้องกลับเป็นกลาง ๆ ด้วยเหตุผลเดียวกัน
function renderEmptyWeather() {
  hasWeather = false;
  document.body.dataset.sky = 'neutral';
  ui.icon.textContent = '';
  ui.temperature.textContent = '–';
  ui.condition.textContent = 'กำลังโหลด…';
  ui.feelsLike.textContent = '–';
  ui.humidity.textContent = '–';
  ui.wind.textContent = '–';
  ui.precipitation.textContent = '–';
  ui.updated.textContent = '';
}

function renderWeather(weather) {
  const { text, icon } = describeWeather(weather.code, weather.isDay);
  const checkedAt = new Date().toLocaleTimeString('th-TH', {
    hour: '2-digit',
    minute: '2-digit',
  });

  hasWeather = true;
  document.body.dataset.sky = skyFor(weather.code, weather.isDay);
  ui.icon.textContent = icon;
  ui.temperature.textContent = formatValue(weather.temperature, '°C');
  ui.condition.textContent = text;
  ui.feelsLike.textContent = formatValue(weather.feelsLike, '°C');
  ui.humidity.textContent = formatValue(weather.humidity, '%');
  ui.wind.textContent = formatValue(weather.windSpeed, ' กม./ชม.');
  ui.precipitation.textContent = formatValue(weather.precipitation, ' มม.', 1);
  // เวลาข้อมูลเป็นเวลาของเมืองนั้น แต่เวลาที่เช็กเป็นเวลาในเครื่อง ต้องบอกให้ชัดจะได้ไม่สับสน
  ui.updated.textContent =
    `${formatDataTime(weather.observedAt, weather.intervalSeconds)}\n` +
    `เช็กล่าสุด ${checkedAt} น. (เวลาในเครื่องคุณ)`;
}

// ใช้ aria-disabled แทน disabled เพราะ disabled ทำให้ปุ่มเสีย focus
// คนที่ใช้คีย์บอร์ดจะหลุดจากปุ่มทุกครั้งที่รีเฟรช และกดซ้ำไม่ได้
function setRefreshing(isRefreshing) {
  ui.refreshButton.setAttribute('aria-disabled', String(isRefreshing));
}

async function refresh() {
  // ถ้าคำขอเก่าตอบกลับช้ากว่าคำขอใหม่ เลขนี้จะไม่ตรงกัน เราก็ทิ้งคำตอบเก่าไป
  // กันไม่ให้กดเมือง A แล้ว B แต่สุดท้ายอากาศของ A มาทับ
  const refreshId = ++latestRefreshId;
  lastCheckedAt = Date.now();
  setRefreshing(true);

  try {
    const url = buildForecastUrl(currentPlace.latitude, currentPlace.longitude);
    const weather = parseForecast(await fetchJson(url));
    if (refreshId !== latestRefreshId) return;
    renderWeather(weather);
    setStatus(ui.weatherStatus, '');
  } catch (error) {
    if (refreshId !== latestRefreshId) return;
    console.error('Weather refresh failed', error);
    if (hasWeather) {
      setStatus(ui.weatherStatus, 'อัปเดตไม่สำเร็จ ตอนนี้เป็นข้อมูลรอบก่อน และจะลองใหม่อัตโนมัติ');
    } else {
      ui.condition.textContent = 'ไม่มีข้อมูล';
      setStatus(ui.weatherStatus, 'โหลดข้อมูลไม่สำเร็จ ลองกดรีเฟรชอีกครั้ง');
    }
  } finally {
    if (refreshId === latestRefreshId) setRefreshing(false);
  }
}

function savePlace(place) {
  // localStorage อาจถูกบล็อกได้ เช่นในโหมดส่วนตัว แอปต้องยังใช้งานได้ แค่จำเมืองไม่ได้
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(place));
  } catch (error) {
    console.warn('Could not save place', error);
  }
}

function loadSavedPlace() {
  try {
    return parseSavedPlace(localStorage.getItem(STORAGE_KEY));
  } catch (error) {
    console.warn('Could not load saved place', error);
    return null;
  }
}

function selectPlace(place) {
  latestPlaceActionId += 1;
  currentPlace = place;
  savePlace(place);
  renderPlace(place);
  renderEmptyWeather();
  setStatus(ui.searchStatus, '');
  setStatus(ui.weatherStatus, '');
  refresh();
}

function clearResults() {
  ui.searchResults.replaceChildren();
  ui.searchResults.hidden = true;
}

function renderResults(places) {
  const items = places.map((place) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'glass';

    // ใช้ textContent ไม่ใช้ innerHTML เพราะชื่อเมืองมาจากภายนอก จะได้ไม่ถูกตีความเป็นโค้ด HTML
    const detail = document.createElement('small');
    detail.textContent = place.label;
    button.append(place.name, detail);

    button.addEventListener('click', () => {
      clearResults();
      ui.searchInput.value = '';
      selectPlace(place);
      // ปุ่มที่กดเพิ่งถูกลบไป ต้องย้าย focus เอง ไม่งั้นคนใช้คีย์บอร์ดจะหลุดตำแหน่ง
      ui.placeName.focus();
    });

    const item = document.createElement('li');
    item.append(button);
    return item;
  });

  ui.searchResults.replaceChildren(...items);
  ui.searchResults.hidden = items.length === 0;
}

async function handleSearch(event) {
  event.preventDefault();
  const query = ui.searchInput.value.trim();
  const actionId = ++latestPlaceActionId;
  clearResults();

  if (query.length < 2) {
    setStatus(ui.searchStatus, 'พิมพ์ชื่อเมืองอย่างน้อย 2 ตัวอักษร');
    return;
  }

  setStatus(ui.searchStatus, 'กำลังค้นหา…');
  try {
    const places = parsePlaces(await fetchJson(buildGeocodingUrl(query)));
    if (actionId !== latestPlaceActionId) return;
    renderResults(places);
    setStatus(
      ui.searchStatus,
      places.length > 0
        ? `พบ ${places.length} เมือง`
        // ฐานข้อมูลไม่มีชื่อไทยของบางเมือง เช่น นิวยอร์ก แต่ชื่ออังกฤษหาเจอ
        : `ไม่พบเมือง "${query}" ลองพิมพ์ชื่อภาษาอังกฤษดูนะ`,
    );
  } catch (error) {
    if (actionId !== latestPlaceActionId) return;
    console.error('Place search failed', error);
    setStatus(ui.searchStatus, 'ค้นหาไม่สำเร็จ ลองใหม่อีกครั้ง');
  }
}

function handleLocate() {
  const actionId = ++latestPlaceActionId;
  clearResults();

  if (!navigator.geolocation) {
    setStatus(ui.searchStatus, 'เบราว์เซอร์นี้หาตำแหน่งไม่ได้ ลองค้นหาชื่อเมืองแทน');
    return;
  }

  setStatus(ui.searchStatus, 'กำลังหาตำแหน่ง…');
  navigator.geolocation.getCurrentPosition(
    ({ coords }) => {
      if (actionId !== latestPlaceActionId) return;
      // ปัดเหลือ 2 ตำแหน่ง (ราว 1 กม.) พอสำหรับดูอากาศ และไม่ส่งพิกัดละเอียดออกไปเกินจำเป็น
      const latitude = Number(coords.latitude.toFixed(2));
      const longitude = Number(coords.longitude.toFixed(2));
      selectPlace({
        name: 'ตำแหน่งของฉัน',
        label: `${latitude}, ${longitude}`,
        latitude,
        longitude,
      });
    },
    (error) => {
      if (actionId !== latestPlaceActionId) return;
      setStatus(
        ui.searchStatus,
        error.code === error.PERMISSION_DENIED
          ? 'ไม่ได้รับอนุญาตให้ใช้ตำแหน่ง ลองค้นหาชื่อเมืองแทน'
          : 'หาตำแหน่งไม่สำเร็จ ลองค้นหาชื่อเมืองแทน',
      );
    },
    { timeout: REQUEST_TIMEOUT_MS, maximumAge: REFRESH_MS },
  );
}

ui.searchForm.addEventListener('submit', handleSearch);
ui.locateButton.addEventListener('click', handleLocate);
ui.refreshButton.addEventListener('click', () => {
  if (ui.refreshButton.getAttribute('aria-disabled') !== 'true') refresh();
});

// อัปเดตอัตโนมัติ แต่ไม่ยิง API ตอนไม่มีใครดูแท็บนี้อยู่
setInterval(() => {
  if (!document.hidden) refresh();
}, REFRESH_MS);

// กลับมาที่แท็บหลังจากหายไปนาน ให้เช็กใหม่ทันที ไม่ต้องรอรอบถัดไป
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && Date.now() - lastCheckedAt >= REFRESH_MS) refresh();
});

selectPlace(loadSavedPlace() ?? DEFAULT_PLACE);
