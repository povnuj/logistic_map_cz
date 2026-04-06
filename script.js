document.addEventListener("DOMContentLoaded", function () {
  let map;
  let points = [];
  let sortable;
  let routeChunks = [];
  let chunkStats = [];
  let routeCalculationTimeout = null;
  let citySortable;
  let autocompleteTimeout;
  let mapInitialized = false;
  const TG_BOT_TOKEN = '8361148227:AAHzQ-Xb3T11T7lzgmR_NtbB6q-yfdXV4E8';
  const TG_CHAT_ID = '601931063';

  const STORAGE_KEY = "mapczRoutePoints";
  const API_BASE = "https://api.mapy.cz";

  let API_KEY = '';//"0aIyQ0ASZ3AcgUp5tFkCHMkCFihUJ25iO46sBTuE0Ps";

  const settingsBtn = document.getElementById('settingsBtn');
  const settingsModal = document.getElementById('settingsModal');
  const settingsSaveBtn = document.getElementById('settingsSaveBtn');
  const settingsCancelBtn = document.getElementById('settingsCancelBtn');
  const mapyTokenInput = document.getElementById('mapyTokenInput');
  const timePerPointInput = document.getElementById('timePerPointInput');
  const pointOpenProviderSwitcher = document.getElementById('pointOpenProviderSwitcher');
  const pointOpenProviderButtons = document.querySelectorAll('#pointOpenProviderSwitcher .settings-switch-option');
  let pointOpenProvider = 'mapy';

  // Відкрити модалку
settingsBtn.addEventListener('click', () => {
  mapyTokenInput.value = localStorage.getItem('mapyCzToken') || '';
  const savedTime = localStorage.getItem('timePerPointMinutes');
  timePerPointInput.value = savedTime !== null ? savedTime : 10;

  pointOpenProvider = localStorage.getItem('pointOpenProvider') || 'mapy';
  updatePointOpenProviderUI(pointOpenProvider);

  settingsModal.style.display = 'flex';
});

pointOpenProviderButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    pointOpenProvider = btn.dataset.provider === 'google' ? 'google' : 'mapy';
    updatePointOpenProviderUI(pointOpenProvider);
  });
});

function updatePointOpenProviderUI(provider) {
  pointOpenProviderButtons.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.provider === provider);
  });
}

  // Зберегти токен
settingsSaveBtn.addEventListener('click', () => {
  const token = mapyTokenInput.value.trim();
  const timePerPoint = parseInt(timePerPointInput.value || 3);

  if (token) localStorage.setItem('mapyCzToken', token);
  else localStorage.removeItem('mapyCzToken');

  localStorage.setItem('timePerPointMinutes', String(timePerPoint));
  localStorage.setItem('pointOpenProvider', pointOpenProvider);

  settingsModal.style.display = 'none';
});

  // Закрити без збереження
  settingsCancelBtn.addEventListener('click', () => {
    settingsModal.style.display = 'none';
  });

  // Закрити по кліку на фон
  settingsModal.addEventListener('click', (e) => {
    if (e.target === settingsModal) settingsModal.style.display = 'none';
  });


  

// ✅ Функція для розрахунку та сортування відстаней по населених пунктах
async function calculateDistancesToFirst10() {
    if (points.length < 2) {
        alert("Потрібно мінімум 2 точки для розрахунку відстаней");
        return;
    }

    // ✅ ПОКАЗУЄМО МОДАЛКУ ПРОГРЕСУ
    showProgressModal();

    console.log("=".repeat(80));
    console.log("📏 РОЗРАХУНОК ВІДСТАНЕЙ ПО НАСЕЛЕНИХ ПУНКТАХ");
    console.log("=".repeat(80));

    // Групуємо точки за населеними пунктами
    const cityGroups = {};
    points.forEach((p, index) => {
        const parts = p.label.split(",").map(s => s.trim());
        let city = null;
        
        if (parts.length >= 2) {
            city = parts[1];
        } else if (parts.length === 1) {
            city = parts[0];
        }
        
        if (city) {
            if (!cityGroups[city]) {
                cityGroups[city] = [];
            }
            cityGroups[city].push({ point: p, originalIndex: index });
        }
    });

    const cityNames = Object.keys(cityGroups);
    console.log(`\n📍 Знайдено ${cityNames.length} населених пунктів:`);
    cityNames.forEach((city, i) => {
        console.log(`   ${i + 1}. ${city} (${cityGroups[city].length} точок)`);
    });

    // Підраховуємо загальну кількість точок
    let totalPointsCount = 0;
    cityNames.forEach(city => {
        totalPointsCount += cityGroups[city].length;
    });

    updateProgressModal(`Знайдено ${cityNames.length} НП з ${totalPointsCount} точками`);

    const startPoint = points[0];
    console.log(`\n🚩 Стартова точка: ${startPoint.label}`);

    let lastPoint = startPoint;
    const sortedResults = [];
    let processedCount = 0;

    // Обробляємо кожен населений пункт
    for (let cityIndex = 0; cityIndex < cityNames.length; cityIndex++) {
        const cityName = cityNames[cityIndex];
        const cityPoints = cityGroups[cityName];

        updateProgressModal(`НП ${cityIndex + 1}/${cityNames.length}: ${cityName}`, processedCount, totalPointsCount);

        console.log("\n" + "─".repeat(80));
        console.log(`📌 НАСЕЛЕНИЙ ПУНКТ: ${cityName}`);
        console.log(`   Точок у цьому НП: ${cityPoints.length}`);
        
        if (cityIndex === 0) {
            console.log(`   Відстань міряємо від: ТОЧКА #1 (${lastPoint.label})`);
        } else {
            console.log(`   Відстань міряємо від: останньої точки попереднього НП`);
            console.log(`   (${lastPoint.label})`);
        }

        const distances = [];
        
        for (let i = 0; i < cityPoints.length; i++) {
            const targetPointData = cityPoints[i];
            const targetPoint = targetPointData.point;
            
            processedCount++;
            updateProgressModal(
                `НП ${cityIndex + 1}/${cityNames.length}: ${cityName}`,
                processedCount,
                totalPointsCount,
                `Обробка: ${targetPoint.label.substring(0, 50)}...`
            );
            
            try {
                const coords = [
                    { lon: lastPoint.lon, lat: lastPoint.lat },
                    { lon: targetPoint.lon, lat: targetPoint.lat }
                ];
                
                const route = await calculateRoute(coords, false);
                
                if (route && route.distance) {
                    const distanceKm = route.distance / 1000;
                    const timeMin = Math.round(route.time / 60);
                    
                    distances.push({
                        pointData: targetPointData,
                        point: targetPoint,
                        distance: distanceKm,
                        time: timeMin,
                        originalIndex: targetPointData.originalIndex
                    });
                } else {
                    console.warn(`   ⚠️ Не вдалося розрахувати для: ${targetPoint.label}`);
                }
                
                await new Promise(resolve => setTimeout(resolve, 300));
                
            } catch (error) {
                console.error(`   ❌ Помилка для точки: ${targetPoint.label}`, error);
            }
        }

        distances.sort((a, b) => a.distance - b.distance);

        console.log(`\n   ✅ Посортовано від найближчої до найдальшої:`);
        console.log("");
        
        distances.forEach((item, idx) => {
            console.log(`   ${idx + 1}. [Точка #${item.originalIndex + 1}] ${item.point.label}`);
            console.log(`      💠 ${item.distance.toFixed(2)} км (≈ ${item.time} хв)`);
        });

        sortedResults.push({
            city: cityName,
            points: distances
        });

        if (distances.length > 0) {
            lastPoint = distances[distances.length - 1].point;
            console.log(`\n   🏁 Остання точка цього НП: ${lastPoint.label}`);
        }
    }

    // Фінальний звіт
    console.log("\n" + "=".repeat(80));
    console.log("✅ РОЗРАХУНОК ЗАВЕРШЕНО");
    console.log("=".repeat(80));
    
    let totalPoints = 0;
    sortedResults.forEach(cityResult => {
        totalPoints += cityResult.points.length;
    });
    
    console.log(`\nОброблено: ${cityNames.length} НП, ${totalPoints} точок`);
    console.log("\n📋 ПІДСУМОК СОРТУВАННЯ:");
    
    sortedResults.forEach((cityResult, idx) => {
        console.log(`\n${idx + 1}. ${cityResult.city}:`);
        cityResult.points.forEach((item, pointIdx) => {
            console.log(`   ${pointIdx + 1}. Точка #${item.originalIndex + 1} - ${item.distance.toFixed(2)} км`);
        });
    });
    
    console.log("\n" + "=".repeat(80));

    // Зберігаємо результати
    updateProgressModal("Зберігаємо результати...", totalPointsCount, totalPointsCount);

    console.log("\n💾 ЗБЕРІГАЄМО В LOCALSTORAGE:");
    console.log("=".repeat(80));
    
    const sortedArray = [];
    
    sortedArray.push({
        lon: startPoint.lon,
        lat: startPoint.lat,
        label: startPoint.label,
        completed: startPoint.completed || false
    });
    
    console.log(`1. ${startPoint.label} (стартова точка)`);
    
    let position = 2;
    sortedResults.forEach(cityResult => {
        cityResult.points.forEach(item => {
            sortedArray.push({
                lon: item.point.lon,
                lat: item.point.lat,
                label: item.point.label,
                duplicateCount: item.point.duplicateCount || 0,
                completed: item.point.completed || false
            });
            console.log(`${position}. ${item.point.label}`);
            position++;
        });
    });

    console.log("\n=".repeat(80));
    console.log(`✅ Масив містить ${sortedArray.length} точок`);
    
    points.length = 0;
    points.push(...sortedArray);
    updateProgressModal('⏱ Розраховуємо час між точками...', 0, sortedArray.length);

for (let i = 1; i < sortedArray.length; i++) {
    updateProgressModal('⏱ Час між точками', i, sortedArray.length);
    try {
        const route = await calculateRoute(
            [
                { lon: sortedArray[i - 1].lon, lat: sortedArray[i - 1].lat },
                { lon: sortedArray[i].lon, lat: sortedArray[i].lat }
            ],
            false
        );
        await new Promise(r => setTimeout(r, 200));
        sortedArray[i].travelTimeFromPrev = route ? Math.round(route.time / 60) : null;
    } catch (e) {
        sortedArray[i].travelTimeFromPrev = null;
    }
}
    
    savePointsToStorage();
    renderList();
    
    if (points.length >= 2) {
        calculateRouteStats();
    }
    
    console.log("💾 Збережено в localStorage");
    console.log("🔄 UI оновлено");
    console.log("=".repeat(80));
    
    // ✅ ЗАКРИВАЄМО МОДАЛКУ
    hideProgressModal();
    
    alert(`✅ Готово!\n\nОброблено: ${totalPoints} точок\nНП: ${cityNames.length}\n\nТочки відсортовано та збережено!`);
}

async function calculateDistancesWithLookahead() {
    if (points.length < 2) {
        alert('Потрібно мінімум 2 точки!');
        return;
    }

    // Спочатку запускаємо стандартну оптимізацію
    await calculateDistancesToFirst10();

    // Після базової оптимізації — застосовуємо lookahead-досортування
    if (points.length < 3) return;

    showProgressModal('🔍 Lookahead: перевірка наступних 2 точок...');

    let improved = true;
    let passCount = 0;
    const MAX_PASSES = 3;

    while (improved && passCount < MAX_PASSES) {
        improved = false;
        passCount++;

        updateProgressModal(`Lookahead прохід ${passCount}/${MAX_PASSES}`, 0, points.length - 1);

        for (let i = 1; i < points.length - 1; i++) {
            const current = points[i - 1];
            const next1 = points[i];
            const next2 = points[i + 1] || null;

            if (!next2) continue;

            updateProgressModal(
                `Lookahead прохід ${passCount}: перевірка точки ${i + 1}/${points.length - 1}`,
                i,
                points.length - 1,
                `${next1.label.substring(0, 40)}...`
            );

            try {
                // Варіант A: current → next1 → next2
                const routeA1 = await calculateRoute(
                    [{ lon: current.lon, lat: current.lat }, { lon: next1.lon, lat: next1.lat }],
                    false
                );
                await new Promise(r => setTimeout(r, 200));

                const routeA2 = await calculateRoute(
                    [{ lon: next1.lon, lat: next1.lat }, { lon: next2.lon, lat: next2.lat }],
                    false
                );
                await new Promise(r => setTimeout(r, 200));

                // Варіант B: current → next2 → next1
                const routeB1 = await calculateRoute(
                    [{ lon: current.lon, lat: current.lat }, { lon: next2.lon, lat: next2.lat }],
                    false
                );
                await new Promise(r => setTimeout(r, 200));

                const routeB2 = await calculateRoute(
                    [{ lon: next2.lon, lat: next2.lat }, { lon: next1.lon, lat: next1.lat }],
                    false
                );
                await new Promise(r => setTimeout(r, 200));

                if (!routeA1 || !routeA2 || !routeB1 || !routeB2) continue;

                const distA = routeA1.distance + routeA2.distance;
                const distB = routeB1.distance + routeB2.distance;

                if (distB < distA) {
                    // Варіант B коротший — міняємо місцями next1 і next2
                    console.log(`🔄 Lookahead swap: точки ${i + 1} і ${i + 2}`);
                    console.log(`   A: ${(distA / 1000).toFixed(2)} км → B: ${(distB / 1000).toFixed(2)} км`);

                    // Зберігаємо travelTime для відображення
                    points[i].travelTimeFromPrev = Math.round(routeB1.time / 60);
                    points[i + 1].travelTimeFromPrev = Math.round(routeB2.time / 60);

                    // Swap
                    [points[i], points[i + 1]] = [points[i + 1], points[i]];

                    improved = true;
                }
            } catch (error) {
                console.error(`Lookahead помилка для точки ${i}:`, error);
            }
        }
    }

    // Після всіх перестановок — розраховуємо travelTime для ВСІХ точок
    updateProgressModal('⏱ Розраховуємо час між точками...', 0, points.length);

    for (let i = 1; i < points.length; i++) {
        updateProgressModal(
            '⏱ Розраховуємо час між точками...',
            i,
            points.length,
            `${points[i].label.substring(0, 40)}...`
        );

        try {
            const route = await calculateRoute(
                [
                    { lon: points[i - 1].lon, lat: points[i - 1].lat },
                    { lon: points[i].lon, lat: points[i].lat }
                ],
                false
            );
            await new Promise(r => setTimeout(r, 200));

            points[i].travelTimeFromPrev = route ? Math.round(route.time / 60) : null;
        } catch (e) {
            points[i].travelTimeFromPrev = null;
        }
    }

    savePointsToStorage();
    renderList();

    hideProgressModal();
    alert(`✅ Lookahead оптимізація завершена! (${passCount} прохід(и))`);
}

// Expose globally

// ✅ ФУНКЦІЇ ДЛЯ МОДАЛКИ ПРОГРЕСУ
function showProgressModal() {
    // Перевіряємо чи модалка вже існує
    let modal = document.getElementById('progress-modal');
    if (!modal) {
        // Створюємо модалку
        modal = document.createElement('div');
        modal.id = 'progress-modal';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.8);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
        `;
        
        modal.innerHTML = `
            <div style="
                background: white;
                border-radius: 15px;
                padding: 30px;
                max-width: 500px;
                width: 90%;
                box-shadow: 0 10px 40px rgba(0,0,0,0.3);
            ">
                <h2 style="margin: 0 0 20px 0; color: #333; font-size: 20px;">
                    📏 Розрахунок відстаней
                </h2>
                <div id="progress-message" style="
                    color: #666;
                    margin-bottom: 15px;
                    font-size: 14px;
                ">
                    Ініціалізація...
                </div>
                <div style="
                    background: #f0f0f0;
                    height: 30px;
                    border-radius: 15px;
                    overflow: hidden;
                    margin-bottom: 10px;
                ">
                    <div id="progress-bar" style="
                        background: linear-gradient(90deg, #4CAF50, #8BC34A);
                        height: 100%;
                        width: 0%;
                        transition: width 0.3s ease;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        color: white;
                        font-weight: bold;
                        font-size: 12px;
                    ">
                        0%
                    </div>
                </div>
                <div id="progress-detail" style="
                    color: #999;
                    font-size: 12px;
                    text-align: center;
                ">
                    Зачекайте...
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
    }
    modal.style.display = 'flex';
}

function updateProgressModal(message, current = 0, total = 100, detail = '') {
    const modal = document.getElementById('progress-modal');
    if (!modal) return;
    
    const messageEl = document.getElementById('progress-message');
    const progressBar = document.getElementById('progress-bar');
    const detailEl = document.getElementById('progress-detail');
    
    if (messageEl) messageEl.textContent = message;
    
    if (progressBar && total > 0) {
        const percent = Math.round((current / total) * 100);
        progressBar.style.width = percent + '%';
        progressBar.textContent = percent + '%';
    }
    
    if (detailEl) {
        if (detail) {
            detailEl.textContent = detail;
        } else {
            detailEl.textContent = `${current} / ${total}`;
        }
    }
}

function hideProgressModal() {
    const modal = document.getElementById('progress-modal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// ✅ Експортуємо функції в window
window.calculateDistancesToFirst10 = calculateDistancesToFirst10;
window.showProgressModal = showProgressModal;
window.updateProgressModal = updateProgressModal;
window.hideProgressModal = hideProgressModal;
window.calculateDistancesWithLookahead = calculateDistancesWithLookahead;



  function getLocalIndex(i, size = 17) {
    if (i === 0) return 1; // Перша точка завжди 1
    const localIdx = (i % 16) + 1; // 16 бо 1 точка перетинається
    return localIdx === 1 ? 17 : localIdx; // 1→17, 2→2, 3→3 ... 16→16, 17→17
  }

  // ✅ Geocoding з REST API
  async function geocodeAddress(query) {
    try {
      const url = `${API_BASE}/v1/geocode?query=${encodeURIComponent(
        query
      )}&lang=cs&limit=5&apikey=${API_KEY}`;
      console.log("🔍 Geocode запит:", query);
      const response = await fetch(url);

      if (!response.ok) {
        console.error("Помилка API:", response.status, response.statusText);
        return [];
      }

      const data = await response.json();

      if (data.items && data.items.length > 0) {
        console.log("📦 Geocode результати:");
        data.items.forEach((item, i) => {
          console.log(`  ${i + 1}. ${item.name}`);
        });
        return data.items;
      }
      return [];
    } catch (error) {
      console.error("Помилка геокодування:", error);
      return [];
    }
  }

  // ✅ Reverse geocoding з REST API
  async function reverseGeocode(lon, lat) {
    try {
      const url = `${API_BASE}/v1/rgeocode?lon=${lon}&lat=${lat}&lang=cs&apikey=${API_KEY}`;
      const response = await fetch(url);

      if (!response.ok) {
        console.error("Помилка API:", response.status);
        return `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
      }

      const data = await response.json();

      if (data.items && data.items.length > 0) {
        return data.items[0].name || `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
      }
      return `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
    } catch (error) {
      console.error("Помилка зворотного геокодування:", error);
      return `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
    }
  }

  // ✅ Декодування polyline формату
  function decodePolyline(encoded) {
    if (!encoded) return [];

    let points = [];
    let index = 0,
      len = encoded.length;
    let lat = 0,
      lng = 0;

    while (index < len) {
      let b,
        shift = 0,
        result = 0;
      do {
        b = encoded.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      let dlat = result & 1 ? ~(result >> 1) : result >> 1;
      lat += dlat;

      shift = 0;
      result = 0;
      do {
        b = encoded.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      let dlng = result & 1 ? ~(result >> 1) : result >> 1;
      lng += dlng;

      points.push([lat / 1e5, lng / 1e5]);
    }

    return points;
  }

  // ✅ Routing з REST API
  async function calculateRoute(coords, returnGeometry = false) {
    try {
      const MAX_WAYPOINTS = 15;

      if (coords.length > 17) {
        console.log(
          `⚠️ Забагато точок (${coords.length}), розбиваємо на сегменти...`
        );

        let totalDistance = 0;
        let totalTime = 0;
        let allGeometry = [];
        let segmentCount = 0;

        for (let i = 0; i < coords.length - 1; i += 16) {
          const end = Math.min(i + 17, coords.length);
          const segment = coords.slice(i, end);

          if (segment.length < 2) break;

          segmentCount++;

          const start = segment[0];
          const finish = segment[segment.length - 1];
          const waypoints = segment.slice(1, -1);

          let url = `${API_BASE}/v1/routing/route?start=${start.lon},${start.lat}&end=${finish.lon},${finish.lat}&routeType=car_fast&apikey=${API_KEY}`;

          if (returnGeometry) {
            url += "&format=polyline";
          }

          if (waypoints.length > 0) {
            const waypointsStr = waypoints
              .map((c) => `${c.lon},${c.lat}`)
              .join(";");
            url += `&waypoints=${waypointsStr}`;
          }

          console.log(
            `  Сегмент ${segmentCount}: точки ${i + 1}-${end} (${
              waypoints.length
            } waypoints)`
          );

          try {
            const response = await fetch(url);

            if (!response.ok) {
              console.error(
                `  ❌ Помилка сегменту ${segmentCount}:`,
                response.status
              );
              continue;
            }

            const data = await response.json();

            if (data.length && data.duration) {
              totalDistance += data.length;
              totalTime += data.duration;

              if (data.geometry && returnGeometry) {
                const decodedPoints = decodePolyline(data.geometry);
                allGeometry = allGeometry.concat(decodedPoints);
                console.log(
                  `  ✅ Сегмент ${segmentCount}: ${(data.length / 1000).toFixed(
                    1
                  )} км, geometry: ${decodedPoints.length} точок`
                );
              } else {
                console.log(
                  `  ✅ Сегмент ${segmentCount}: ${(data.length / 1000).toFixed(
                    1
                  )} км`
                );
              }
            }
          } catch (err) {
            console.error(`  ❌ Помилка запиту сегменту ${segmentCount}:`, err);
          }

          await new Promise((resolve) => setTimeout(resolve, 300));
        }

        if (totalDistance > 0 && totalTime > 0) {
          console.log(`✅ Загалом: ${(totalDistance / 1000).toFixed(1)} км`);

          if (returnGeometry && allGeometry.length > 0) {
            return {
              distance: totalDistance,
              time: totalTime,
              geometry: allGeometry,
            };
          }

          return {
            distance: totalDistance,
            time: totalTime,
          };
        }

        return null;
      }

      const start = coords[0];
      const end = coords[coords.length - 1];
      const waypoints = coords.slice(1, -1);

      let url = `${API_BASE}/v1/routing/route?start=${start.lon},${start.lat}&end=${end.lon},${end.lat}&routeType=car_fast&apikey=${API_KEY}`;

      if (returnGeometry) {
        url += "&format=polyline";
      }

      if (waypoints.length > 0) {
        const waypointsStr = waypoints
          .map((c) => `${c.lon},${c.lat}`)
          .join(";");
        url += `&waypoints=${waypointsStr}`;
      }

      console.log(
        `📍 Розраховуємо маршрут: ${coords.length} точок (${waypoints.length} waypoints)`
      );

      const response = await fetch(url);

      if (!response.ok) {
        console.error("Помилка API:", response.status);
        return null;
      }

      const data = await response.json();

      if (data.length && data.duration) {
        console.log(`✅ Маршрут: ${(data.length / 1000).toFixed(1)} км`);

        if (returnGeometry && data.geometry) {
          const decodedPoints = decodePolyline(data.geometry);
          console.log(`✅ Geometry декодовано: ${decodedPoints.length} точок`);
          return {
            distance: data.length,
            time: data.duration,
            geometry: decodedPoints,
          };
        }

        return {
          distance: data.length,
          time: data.duration,
        };
      }

      return null;
    } catch (error) {
      console.error("Помилка розрахунку маршруту:", error);
      return null;
    }
  }

  function parseAddress(fullAddress) {
    if (!fullAddress || fullAddress.trim() === "") {
      return { city: "Невідома адреса", address: "" };
    }

    const parts = fullAddress.split(",").map((s) => s.trim());

    if (parts.length >= 2) {
      let city = parts[1];
      let address = parts[0];

      if (parts.length >= 3 && /^\d{3}\s?\d{2}$/.test(parts[2])) {
        address += ", " + parts[2];
      }

      return { city: city, address: address };
    } else {
      return { city: fullAddress, address: "" };
    }
  }

  function findDuplicates() {
    const duplicates = new Set();
    const seen = new Map();

    points.forEach((p, index) => {
      if (!p.lon || !p.lat) {
        console.warn(`Точка ${index} не має координат:`, p);
        return;
      }

      const key = `${p.lon.toFixed(4)},${p.lat.toFixed(4)}`;

      if (seen.has(key)) {
        duplicates.add(index);
        duplicates.add(seen.get(key));
      } else {
        seen.set(key, index);
      }
    });

    return duplicates;
  }

  function savePointsToStorage() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(points));
      console.log("✅ Точки збережено");
    } catch (e) {
      console.error("❌ Помилка збереження:", e);
    }
  }

  async function recalcTravelTimes() {
  points.forEach((p, i) => {
    if (i === 0) p.travelTimeFromPrev = null;
  });

  for (let i = 1; i < points.length; i++) {
    try {
      const route = await calculateRoute(
        [
          { lon: points[i - 1].lon, lat: points[i - 1].lat },
          { lon: points[i].lon, lat: points[i].lat }
        ],
        false
      );
      await new Promise(r => setTimeout(r, 150));
      points[i].travelTimeFromPrev = route ? Math.round(route.time / 60) : null;
    } catch (e) {
      points[i].travelTimeFromPrev = null;
    }
  }

  savePointsToStorage();
  renderList();
}

function loadPointsFromStorage() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const loadedPoints = JSON.parse(stored);
      points = loadedPoints
        .map((p) => {
          if (p.lon !== undefined && p.lat !== undefined) {
            return {
              lon: p.lon,
              lat: p.lat,
              label: p.label,
              completed: p.completed || false,
              duplicateCount: p.duplicateCount || undefined,
              travelTimeFromPrev: p.travelTimeFromPrev != null ? p.travelTimeFromPrev : null
            };
          }
          
          if (
            p.coords &&
            p.coords.x !== undefined &&
            p.coords.y !== undefined
          ) {
            console.log("🔄 Міграція старого формату:", p.label);
            return {
              lon: p.coords.x,
              lat: p.coords.y,
              label: p.label,
              completed: p.completed || false,
              duplicateCount: p.duplicateCount || undefined,
              travelTimeFromPrev: p.travelTimeFromPrev != null ? p.travelTimeFromPrev : null 
            };
          }
          
          if (p.x !== undefined && p.y !== undefined) {
            console.log("🔄 Міграція формату x/y:", p.label);
            return {
              lon: p.x,
              lat: p.y,
              label: p.label,
              completed: p.completed || false,
              duplicateCount: p.duplicateCount || undefined,
              travelTimeFromPrev: p.travelTimeFromPrev != null ? p.travelTimeFromPrev : null
            };
          }
          
          console.warn("⚠️ Невідомий формат точки:", p);
          return null;
        })
        .filter((p) => p !== null);
      
      console.log(`✅ Завантажено ${points.length} точок`);
      savePointsToStorage();
      renderList();
      if (points.length >= 2) {
        calculateRouteStats();
      }
    }
  } catch (e) {
    console.error("❌ Помилка завантаження:", e);
    points = [];
  }
}


  function clearAllPoints() {
    if (points.length === 0) {
      alert("Список вже порожній!");
      return;
    }

    if (confirm(`Видалити всі ${points.length} точок?\nЦя дія незворотна!`)) {
      points = [];
      localStorage.removeItem(STORAGE_KEY);
      renderList();
      document.getElementById("header-stats").style.display = "none";
      console.log("🗑️ Всі точки видалено");

      if (navigator.vibrate) navigator.vibrate([50, 100, 50]);
    }
  }

  // ✅ ВИПРАВЛЕНА функція initAutocomplete - формат БЕЗ PSČ
  function initAutocomplete() {
    const input = document.getElementById("address-input");
    const dropdown = document.getElementById("autocomplete-dropdown");

    if (!window.addressAutocomplete) {
      window.addressAutocomplete = { selectedItem: null, fullAddress: null };
    }

    input.addEventListener("input", function (e) {
      const query = e.target.value.trim();
      window.addressAutocomplete.selectedItem = null;
      window.addressAutocomplete.fullAddress = null;

      if (query.length < 3) {
        dropdown.style.display = "none";
        return;
      }

      clearTimeout(autocompleteTimeout);

      autocompleteTimeout = setTimeout(async () => {
        console.log("🔍 Шукаємо:", query);
        const results = await geocodeAddress(query);

        console.log("📋 Отримано результатів:", results.length);

        if (results.length > 0) {
          dropdown.innerHTML = "";

          results.forEach((item, index) => {
            // ✅ Формуємо адресу: "Hvozdnice 115, Hvozdnice, 252 05, Praha-západ"
            let fullAddress = "";

            if (item.name) {
              fullAddress = item.name; // "Hvozdnice 115"

              // Збираємо тільки потрібні частини з regionalStructure
              if (item.regionalStructure && item.regionalStructure.length > 0) {
                const parts = [];

                // ЗАВЖДИ шукаємо municipality (місто/село)
                const municipality = item.regionalStructure.find(
                  (r) => r.type === "regional.municipality"
                );
                if (municipality && municipality.name) {
                  parts.push(municipality.name); // Завжди додаємо, навіть якщо співпадає
                }

                // Додаємо PSČ якщо є
                if (item.zip) {
                  parts.push(item.zip);
                }

                // Шукаємо район (Praha-západ, okres Praha-západ тощо)
                const district = item.regionalStructure.find(
                  (r) =>
                    r.type === "regional.region" &&
                    (r.name.includes("Praha") || r.name.includes("okres"))
                );
                if (district && district.name) {
                  // Прибираємо слово "okres " якщо є
                  const districtName = district.name.replace(/^okres\s+/i, "");
                  parts.push(districtName);
                }

                if (parts.length > 0) {
                  fullAddress += ", " + parts.join(", ");
                }
              } else if (item.zip) {
                // Якщо немає regionalStructure але є PSČ
                fullAddress += ", " + item.zip;
              }
            } else if (item.label) {
              fullAddress = item.label;
            } else {
              fullAddress = "Невідома адреса";
            }

            console.log(`➕ Додаємо в dropdown: "${fullAddress}"`);

            const div = document.createElement("div");
            div.className = "autocomplete-item";
            div.textContent = fullAddress;

            div.onclick = function () {
              console.log("✅ Клік на:", fullAddress);

              input.value = fullAddress;
              window.addressAutocomplete.selectedItem = item;
              window.addressAutocomplete.fullAddress = fullAddress;
              dropdown.style.display = "none";
              console.log("✅ Input встановлено:", input.value);
            };

            dropdown.appendChild(div);
          });

          dropdown.style.display = "block";
          console.log("✅ Dropdown показано");
        } else {
          dropdown.style.display = "none";
          console.log("⚠️ Результатів не знайдено");
        }
      }, 500);
    });

    input.addEventListener("keypress", function (e) {
      if (e.key === "Enter") {
        dropdown.style.display = "none";
        window.addAddress();
      }
    });

    document.addEventListener("click", function (e) {
      if (!input.contains(e.target) && !dropdown.contains(e.target)) {
        dropdown.style.display = "none";
      }
    });
  }

  function initCityAutocomplete() {
    const input = document.getElementById("city-order-input");
    const dropdown = document.getElementById("city-order-autocomplete");
    if (!input || !dropdown) return;

    if (!window.cityAutocomplete)
      window.cityAutocomplete = { selectedItem: null, fullAddress: null };

    input.addEventListener("input", function (e) {
      const query = e.target.value.trim();
      window.cityAutocomplete.selectedItem = null;
      window.cityAutocomplete.fullAddress = null;

      if (query.length < 3) {
        dropdown.style.display = "none";
        return;
      }

      clearTimeout(autocompleteTimeout);
      autocompleteTimeout = setTimeout(async () => {
        const results = await geocodeAddress(query);
        if (!results || results.length === 0) {
          dropdown.style.display = "none";
          return;
        }

        dropdown.innerHTML = "";
        results.forEach((item) => {
          // Формат як у точках (initAutocomplete)
          let fullAddress = "";
          if (item.name) fullAddress = item.name;

          if (item.regionalStructure && item.regionalStructure.length > 0) {
            const parts = [];

            const municipality = item.regionalStructure.find(
              (r) => r.type === "regional.municipality"
            );
            if (municipality && municipality.name)
              parts.push(municipality.name);

            if (item.zip) parts.push(item.zip);

            const district = item.regionalStructure.find(
              (r) =>
                r.type === "regional.region" &&
                (r.name.includes("Praha") || r.name.includes("okres"))
            );
            if (district && district.name) {
              const districtName = district.name.replace(/okres\s*/i, "");
              parts.push(districtName);
            }

            if (parts.length > 0)
              fullAddress = fullAddress + ", " + parts.join(", ");
          } else if (item.zip) {
            fullAddress = fullAddress + ", " + item.zip;
          } else if (item.label && !fullAddress) {
            fullAddress = item.label;
          }

          if (!fullAddress) return;

          const div = document.createElement("div");
          div.className = "autocomplete-item";
          div.textContent = fullAddress;
          div.onclick = function () {
            input.value = fullAddress;
            window.cityAutocomplete.selectedItem = item;
            window.cityAutocomplete.fullAddress = fullAddress;
            dropdown.style.display = "none";
          };
          dropdown.appendChild(div);
        });

        dropdown.style.display = dropdown.children.length ? "block" : "none";
      }, 500);
    });

    document.addEventListener("click", function (e) {
      if (!input.contains(e.target) && !dropdown.contains(e.target)) {
        dropdown.style.display = "none";
      }
    });
  }

  window.saveCityToStorage = function () {
    const input = document.getElementById("city-order-input");
    const val = input.value.trim();

    if (!val) {
      alert("Оберіть населений пункт зі списку");
      return;
    }

    if (!window.cityAutocomplete || !window.cityAutocomplete.selectedItem) {
      alert("Будь ласка, оберіть населений пункт зі списку");
      return;
    }

    const item = window.cityAutocomplete.selectedItem;
    const fullAddress = window.cityAutocomplete.fullAddress;

    let cities = [];
    try {
      const stored = localStorage.getItem("mapczCityOrder");
      if (stored) {
        cities = JSON.parse(stored);
      }
    } catch (e) {
      console.error("Помилка читання localStorage:", e);
    }

    const cityData = {
      label: fullAddress,
      lon: item.position
        ? item.position.lon
        : item.location
        ? item.location.lon
        : null,
      lat: item.position
        ? item.position.lat
        : item.location
        ? item.location.lat
        : null,
    };

    if (!cityData.lon || !cityData.lat) {
      alert("Не вдалося отримати координати населеного пункту");
      return;
    }

    const exists = cities.some((c) => c.label === fullAddress);
    if (exists) {
      alert("Цей населений пункт вже є в списку");
      return;
    }

    cities.push(cityData);

    try {
      localStorage.setItem("mapczCityOrder", JSON.stringify(cities));
      console.log("✅ НП збережено:", cityData);
      alert("✅ Населений пункт додано");

      input.value = "";
      window.cityAutocomplete.selectedItem = null;
      window.cityAutocomplete.fullAddress = null;
    } catch (e) {
      console.error("❌ Помилка збереження:", e);
      alert("Помилка збереження");
    }
  };

  async function addAddress() {
    const input = document.getElementById("address-input");
    const val = input.value.trim();
    if (!val) return;

    console.log("🔵 addAddress викликано з val:", val);

    let coords = null;
    let finalLabel = val;

    // Перевіряємо чи є збережений item
    if (window.addressAutocomplete && window.addressAutocomplete.selectedItem) {
      console.log("✅ Є збережений selectedItem");

      const item = window.addressAutocomplete.selectedItem;

      // ✅ API повертає position, а не location!
      if (item.position && item.position.lon && item.position.lat) {
        coords = {
          lon: item.position.lon,
          lat: item.position.lat,
        };
        console.log("✅ Координати з position:", coords);

        // Використовуємо збережену адресу
        if (window.addressAutocomplete.fullAddress) {
          finalLabel = window.addressAutocomplete.fullAddress;
        }
      } else if (item.location && item.location.lon && item.location.lat) {
        // Запасний варіант якщо буде location
        coords = {
          lon: item.location.lon,
          lat: item.location.lat,
        };
        console.log("✅ Координати з location:", coords);

        if (window.addressAutocomplete.fullAddress) {
          finalLabel = window.addressAutocomplete.fullAddress;
        }
      } else {
        console.error("❌ selectedItem не має position/location:", item);
      }

      // Очищуємо
      window.addressAutocomplete.selectedItem = null;
      window.addressAutocomplete.fullAddress = null;
    } else {
      console.log("⚠️ Немає selectedItem, виконуємо geocode");
      const results = await geocodeAddress(val);

      console.log("📦 Geocode результати:", results);

      if (results.length > 0) {
        const item = results[0];

        console.log("📍 Використовуємо перший результат:", item);

        // ✅ Перевіряємо position або location
        if (item.position && item.position.lon && item.position.lat) {
          coords = {
            lon: item.position.lon,
            lat: item.position.lat,
          };
          console.log("✅ Координати з position:", coords);
        } else if (item.location && item.location.lon && item.location.lat) {
          coords = {
            lon: item.location.lon,
            lat: item.location.lat,
          };
          console.log("✅ Координати з location:", coords);
        } else {
          console.error("❌ item не має position/location:", item);
        }

        if (coords) {
          // ✅ Формуємо повну адресу
          finalLabel = item.name;

          if (item.regionalStructure && item.regionalStructure.length > 0) {
            const parts = [];

            const municipality = item.regionalStructure.find(
              (r) => r.type === "regional.municipality"
            );
            if (municipality && municipality.name) {
              parts.push(municipality.name);
            }

            if (item.zip) {
              parts.push(item.zip);
            }

            const district = item.regionalStructure.find(
              (r) =>
                r.type === "regional.region" &&
                (r.name.includes("Praha") || r.name.includes("okres"))
            );
            if (district && district.name) {
              const districtName = district.name.replace(/^okres\s+/i, "");
              parts.push(districtName);
            }

            if (parts.length > 0) {
              finalLabel += ", " + parts.join(", ");
            }
          } else if (item.zip) {
            finalLabel += ", " + item.zip;
          }

          console.log("✅ Сформована адреса:", finalLabel);
        }
      } else {
        console.error("❌ Geocode повернув 0 результатів");
      }
    }

    if (coords) {
      // Перевірка на дублікат
      const key = `${coords.lon.toFixed(4)},${coords.lat.toFixed(4)}`;
      const existingPoint = points.find((p) => {
        const pKey = `${p.lon.toFixed(4)},${p.lat.toFixed(4)}`;
        return pKey === key;
      });

      if (existingPoint) {
        // Точка вже є - НЕ додаємо
        if (!existingPoint.duplicateCount) {
          existingPoint.duplicateCount = 2;
        } else {
          existingPoint.duplicateCount++;
        }
        console.log(`⚠️ Дублікат! Лічильник: ${existingPoint.duplicateCount}`);
        alert(`⚠️ Ця точка вже додана! (${existingPoint.duplicateCount}x)`);
        renderList();
        savePointsToStorage();
        return; // НЕ додаємо точку
      }

      points.push({
        lon: coords.lon,
        lat: coords.lat,
        label: finalLabel,
        completed: false
      });

      console.log("✅ Точку додано до масиву:", {
        lon: coords.lon,
        lat: coords.lat,
        label: finalLabel,
      });

      renderList();
      savePointsToStorage();
    //   input.value = "";

      if (points.length >= 2) {
        calculateRouteStats();
      } else {
        document.getElementById("header-stats").style.display = "none";
      }
    } else {
      console.error("❌ coords = null, точку НЕ додано");
      alert("Не знайдено цю адресу");
    }
  }

function renderList() {
  const list = document.getElementById("address-list");
  list.innerHTML = "";
  
  points.forEach((p, i) => {
    const parsed = parseAddress(p.label);
    const li = document.createElement("li");
    
    if (p.completed) {
      li.classList.add("completed");
    }
    
    let travelTimeHTML = '';
if (i > 0 && p.travelTimeFromPrev != null) {
    travelTimeHTML = `<span class="travel-time">🕐 ${p.travelTimeFromPrev} хв</span>`;
}

let addressHTML = `<div class="city-name">${parsed.city}${travelTimeHTML}</div>`;
    
    if (parsed.address) {
      addressHTML += `<div class="address-detail">${parsed.address}</div>`;
    }
    
    let duplicateBadge = "";
    if (p.duplicateCount && p.duplicateCount > 1) {
      duplicateBadge = `<span class="duplicate-counter">${p.duplicateCount}x</span>`;
      li.classList.add("duplicate");
    }
    
    const navIcon = p.completed ? "✓" : "🧭";
    
    li.innerHTML = `
      <div class="handle">☰</div>
      <div class="badge">
        <div class="badge-main">${i + 1}</div>
        <div class="badge-sub">${getLocalIndex(i)}</div>
      </div>
      <div class="text">${addressHTML}</div>
      ${duplicateBadge}
      <div class="comment-btn" id="comment-btn-${i}" onclick="openCommentModal(${i})" title="Коментар">📦</div>
      <div class="nav-btn ${p.completed ? 'completed' : ''}" onclick="navigateToPoint(${i})" title="Навігація до цієї точки">${navIcon}</div>
      <div class="del" onclick="removePoint(${i})">✕</div>
    `;
    
    list.appendChild(li);
    
    // Перевіряємо наявність запису в Firebase
    checkFirebaseComment(i, parsed);
  });
  
  document.getElementById("count").innerText = points.length - 1;
}


function getFirebaseKeys(parsed) {
  if (!parsed.address) return null;

  // Видаляємо PSČ (252 06) з адреси якщо є
  const addressClean = parsed.address.replace(/,\s*\d{3}\s?\d{2}$/, "").trim();

  // Розбиваємо: все до останнього числового токена = вулиця, останній токен = будинок
  // Підтримує: "M. J. Hurta 137", "Třebenice 1", "Nová ulice 12a"
  const addressMatch = addressClean.match(/^(.+?)\s+(\d+\S*)$/);
  if (!addressMatch) return null;

  const street = addressMatch[1]
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // č→c, š→s, ě→e...
    .replace(/\./g, "")                                // M. J. → m j
    .replace(/\s+/g, '-')                              // пробіли → дефіс
    .replace(/-+/g, '-')                               // подвійні дефіси → один
    .replace(/^-|-$/g, '');                            // прибираємо дефіси на краях

  const house = addressMatch[2];

  const cityKey = parsed.city
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, '-');

  if (!street || !house || !cityKey) return null;

  return { street, house, cityKey };
}

function checkFirebaseComment(index, parsed) {
  const keys = getFirebaseKeys(parsed);
  if (!keys) return;

  const url = `https://mapy-cz-be68d-default-rtdb.firebaseio.com/city/${keys.cityKey}/${keys.street}/${keys.house}.json`;

  fetch(url)
    .then(res => res.json())
    .then(data => {
      const btn = document.getElementById(`comment-btn-${index}`);
      if (btn && data !== null) btn.classList.add("has-comment");
    })
    .catch(() => {});
}

function openCommentModal(index) {
  const parsed = parseAddress(points[index].label);
  const keys = getFirebaseKeys(parsed);
  if (!keys) return;

  const url = `https://mapy-cz-be68d-default-rtdb.firebaseio.com/city/${keys.cityKey}/${keys.street}/${keys.house}.json`;

  fetch(url)
    .then(res => res.json())
    .then(data => {
      const existing = (data && data.comment) ? data.comment : "";

      const modal = document.createElement("div");
      modal.id = "comment-modal";
      modal.innerHTML = `
        <div class="modal-overlay" onclick="closeCommentModal()"></div>
        <div class="modal-box">
          <h3>💬 ${parsed.city}, ${parsed.address}</h3>
          <textarea id="comment-textarea" rows="6" placeholder="Введіть коментар...">${existing}</textarea>
          <div class="modal-actions">
            <button onclick="saveComment(${index}, '${keys.cityKey}', '${keys.street}', '${keys.house}')">💾 Зберегти</button>
            <button onclick="closeCommentModal()">✕ Закрити</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
    });
}

function closeCommentModal() {
  const modal = document.getElementById("comment-modal");
  if (modal) modal.remove();
}

function saveComment(index, cityKey, street, house) {
  const text = document.getElementById("comment-textarea").value;
  const url = `https://mapy-cz-be68d-default-rtdb.firebaseio.com/city/${cityKey}/${street}/${house}.json`;

  fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ comment: text })
  }).then(() => {
    const btn = document.getElementById(`comment-btn-${index}`);
    if (btn) btn.classList.toggle("has-comment", text.trim() !== "");
    closeCommentModal();
  });
}





function removePoint(i) {
  const point = points[i];

  // Якщо є лічильник дублікатів - зменшуємо його (без підтвердження)
  if (point.duplicateCount && point.duplicateCount > 1) {
    point.duplicateCount--;
    console.log(`🔻 Лічильник зменшено до: ${point.duplicateCount}x`);

    renderList();
    savePointsToStorage();
    return; // НЕ видаляємо точку, тільки зменшуємо лічильник
  }

  // ✅ Промпт перед видаленням точки
  const confirmed = confirm(`Видалити точку "${point.name || `#${i + 1}`}"?`);
  if (!confirmed) {
    console.log(`❌ Видалення скасовано (індекс ${i})`);
    return;
  }

  // Якщо лічильника немає або він дорівнює 1 - видаляємо точку
  points.splice(i, 1);
  console.log(`🗑️ Точку видалено (індекс ${i})`);

  renderList();
  savePointsToStorage();

  if (points.length >= 2) {
    calculateRouteStats();
  } else {
    document.getElementById("header-stats").style.display = "none";
  }
}


  function initMap() {
    map = L.map("map-container").setView([49.8, 15.4], 7);

    L.tileLayer(
      `https://api.mapy.cz/v1/maptiles/basic/256/{z}/{x}/{y}?apikey=${API_KEY}`,
      {
        minZoom: 2,
        maxZoom: 19,
        attribution: '&copy; <a href="https://mapy.cz">Mapy.cz</a>',
      }
    ).addTo(map);

    mapInitialized = true;
    console.log("✅ Карта ініціалізована");
  }

  async function openMap() {
    if (points.length === 0) return alert("Спочатку додайте точки!");

    document.getElementById("map-container").style.display = "block";
    document.getElementById("close-map-btn").style.display = "flex";

    if (!mapInitialized) {
      initMap();
    }

    await new Promise((resolve) => setTimeout(resolve, 100));

    map.invalidateSize();

    map.eachLayer((layer) => {
      if (layer instanceof L.Marker || layer instanceof L.Polyline) {
        map.removeLayer(layer);
      }
    });

    const markers = [];
    points.forEach((p, i) => {
      const marker = L.marker([p.lat, p.lon])
        .bindPopup(`<b>${i + 1} (${getLocalIndex(i)})</b> ${p.label}`)
        .addTo(map);
      markers.push(marker);
    });

    if (points.length > 1) {
      console.log("🗺️ Завантажуємо геометрію маршруту...");

      const coords = points.map((p) => ({ lon: p.lon, lat: p.lat }));
      const routeData = await calculateRoute(coords, true);

      if (routeData && routeData.geometry && routeData.geometry.length > 0) {
        console.log(
          `✅ Геометрія завантажена: ${routeData.geometry.length} точок`
        );

        L.polyline(routeData.geometry, {
          color: "#e74c3c",
          weight: 5,
          opacity: 0.8,
          smoothFactor: 1,
        }).addTo(map);

        console.log("✅ Маршрут намальовано на карті");
      } else {
        console.warn(
          "⚠️ Не вдалося завантажити геометрію, малюємо пряму лінію"
        );

        const routeCoords = points.map((p) => [p.lat, p.lon]);
        L.polyline(routeCoords, {
          color: "#95a5a6",
          weight: 3,
          opacity: 0.6,
          dashArray: "10, 10",
        }).addTo(map);
      }
    }

    if (markers.length > 0) {
      const group = L.featureGroup(markers);
      map.fitBounds(group.getBounds().pad(0.1));
    }
  }

  function closeMap() {
    document.getElementById("map-container").style.display = "none";
    document.getElementById("close-map-btn").style.display = "none";
  }

  async function calculateRouteStats() {
    if (points.length < 2) {
      document.getElementById("header-stats").style.display = "none";
      return;
    }

    if (routeCalculationTimeout) {
      clearTimeout(routeCalculationTimeout);
    }

    const statsDiv = document.getElementById("header-stats");
    statsDiv.style.display = "flex";
    statsDiv.classList.add("loading");
    document.getElementById("stat-time").innerText = "...";
    document.getElementById("stat-dist").innerText = "...";

    routeCalculationTimeout = setTimeout(async () => {
      console.log("🔄 Розраховуємо маршрут...");

      const coords = points.map((p) => ({ lon: p.lon, lat: p.lat }));
      const result = await calculateRoute(coords, false);

      if (result) {
        console.log("✅ Маршрут розраховано:", result);
        updateStatsUI(result.distance, result.time);
        statsDiv.classList.remove("loading");
      } else {
        console.error("❌ Помилка розрахунку");
        statsDiv.style.display = "none";
        statsDiv.classList.remove("loading");
      }
    }, 500);
  }

  function openCityOrderModal() {
    let cityObjects = [];
    try {
      const stored = localStorage.getItem("mapczCityOrder");
      if (stored) {
        cityObjects = JSON.parse(stored);
      }
    } catch (e) {
      console.error("Помилка читання localStorage:", e);
    }

    // if (cityObjects.length === 0) {
    //   return alert("Спочатку додайте населені пункти через поле вище");
    // }

    const cities = cityObjects.map((cityObj) => {
      const parts = cityObj.label.split(",").map((s) => s.trim());
      if (parts.length >= 2) {
        return parts[1];
      } else if (parts.length === 1) {
        return parts[0];
      }
      return cityObj.label;
    });

    console.log("🏙️ НП з localStorage:", cities);

    const cityCounts = {};
    cities.forEach((city) => {
      cityCounts[city] = 0;
    });

    points.forEach((point) => {
      const parts = point.label.split(",").map((s) => s.trim());
      let pointCity = null;

      if (parts.length >= 2) {
        pointCity = parts[1];
      } else if (parts.length === 1) {
        pointCity = parts[0];
      }

      if (pointCity && cities.includes(pointCity)) {
        cityCounts[pointCity]++;
      }
    });

    console.log("📊 Кількість точок по НП:", cityCounts);

    const modal = document.getElementById("city-order-modal");
    const list = document.getElementById("city-order-list");
    modal.style.display = "flex";
    list.innerHTML = "";

    cities.forEach((city, index) => {
      const count = cityCounts[city] || 0;
      const div = document.createElement("div");
      div.className = "city-order-item";
      div.setAttribute("data-city", city);
      div.setAttribute("data-index", index);
      div.innerHTML = `
                <div class="city-handle">☰</div>
                <div class="city-badge">${index + 1}</div>
                <div class="city-info">
                    <div class="city-title">${city}</div>
                    <div class="city-count">${count} точок</div>
                </div>
                <div class="del" onclick="removeCityFromStorage(${index})" style="margin-left: auto; cursor: pointer; padding: 5px 10px;">✕</div>
            `;
      list.appendChild(div);
    });

    if (citySortable) citySortable.destroy();
    citySortable = Sortable.create(list, {
      handle: ".city-handle",
      animation: 150,
      ghostClass: "sortable-ghost",
      onEnd: function () {
        const items = document.querySelectorAll(".city-order-item");
        items.forEach((item, idx) => {
          item.querySelector(".city-badge").textContent = idx + 1;
        });

        const newOrder = [];
        items.forEach((item) => {
          const oldIndex = parseInt(item.getAttribute("data-index"));
          newOrder.push(cityObjects[oldIndex]);
        });

        try {
          localStorage.setItem("mapczCityOrder", JSON.stringify(newOrder));
          console.log("✅ Порядок НП оновлено");
        } catch (e) {
          console.error("❌ Помилка збереження порядку:", e);
        }
      },
    });
  }

  window.removeCityFromStorage = function (index) {
    if (!confirm("Видалити цей населений пункт зі списку?")) {
      return;
    }

    try {
      const stored = localStorage.getItem("mapczCityOrder");
      if (stored) {
        let cities = JSON.parse(stored);
        cities.splice(index, 1);
        localStorage.setItem("mapczCityOrder", JSON.stringify(cities));
        console.log("✅ НП видалено");

        // Перевідкриваємо модальне вікно
        openCityOrderModal();
      }
    } catch (e) {
      console.error("❌ Помилка видалення:", e);
      alert("Помилка видалення");
    }
  };

  function closeCityOrderModal() {
    document.getElementById("city-order-modal").style.display = "none";
  }

  function applyCityOrder() {
    const items = document.querySelectorAll(".city-order-item");
    const orderedCities = Array.from(items).map((item) =>
      item.getAttribute("data-city")
    );

    closeCityOrderModal();

    const cityGroups = {};
    points.forEach((p) => {
      const city = p.label.split(",")[1]?.trim() || "Інше";
      if (!cityGroups[city]) cityGroups[city] = [];
      cityGroups[city].push(p);
    });

    for (let city in cityGroups) {
      cityGroups[city] = nearestNeighborRoute(cityGroups[city]);
    }

    let sortedPoints = [];
    orderedCities.forEach((city) => {
      if (cityGroups[city])
        sortedPoints = sortedPoints.concat(cityGroups[city]);
    });

    points = sortedPoints;
    renderList();
    savePointsToStorage();
    calculateRouteStats();
    if (navigator.vibrate) navigator.vibrate(50);
  }

  function optimizePointsOrder() {
    if (points.length < 3) return alert("Треба мінімум 3 точки");

    // ⭐ Зберігаємо першу точку як START - вона не сортується
    const startPoint = points[0];
    const pointsToSort = points.slice(1); // Всі точки крім першої

    // Завантажуємо порядок НП з localStorage
    let cityObjects = [];
    try {
      const stored = localStorage.getItem("mapczCityOrder");
      if (stored) {
        cityObjects = JSON.parse(stored);
      }
    } catch (e) {
      console.error("Помилка читання localStorage:", e);
    }

    if (cityObjects.length === 0) {
      // Якщо немає порядку НП - просто сортуємо всі точки (крім START)
      let route = nearestNeighborRoute(pointsToSort);
      points = [startPoint, ...route]; // ⭐ START завжди перший
    } else {
      // Витягуємо назви міст з localStorage
      const orderedCities = cityObjects.map((cityObj) => {
        const parts = cityObj.label.split(",").map((s) => s.trim());
        if (parts.length >= 2) return parts[1]; // municipality
        else if (parts.length === 1) return parts[0];
        return cityObj.label;
      });

      // Групуємо точки (БЕЗ першої!) по НП
      const cityGroups = {};
      pointsToSort.forEach((p) => {
        const parts = p.label.split(",").map((s) => s.trim());
        let city = null;
        if (parts.length >= 2) city = parts[1];
        else if (parts.length === 1) city = parts[0];

        if (!cityGroups[city]) cityGroups[city] = [];
        cityGroups[city].push(p);
      });

      // Сортуємо точки всередині кожного НП
      for (let city in cityGroups) {
        cityGroups[city] = nearestNeighborRoute(cityGroups[city]);
      }

      // Обробляємо точки без НП - вставляємо після найближчого НП
      const unassignedCities = [];
      for (let city in cityGroups) {
        if (!orderedCities.includes(city)) {
          unassignedCities.push(city);
        }
      }

      // Для кожного НП без порядку знаходимо найближчий НП з порядком
      unassignedCities.forEach((unassignedCity) => {
        const unassignedPoints = cityGroups[unassignedCity];
        if (unassignedPoints.length === 0) return;

        // Центр групи точок без НП
        let avgLon = 0,
          avgLat = 0;
        unassignedPoints.forEach((p) => {
          avgLon += p.lon;
          avgLat += p.lat;
        });
        avgLon /= unassignedPoints.length;
        avgLat /= unassignedPoints.length;

        // Шукаємо найближчий НП з localStorage
        let minDist = Infinity;
        let nearestCityIndex = orderedCities.length; // За замовчуванням в кінець

        orderedCities.forEach((city, idx) => {
          if (!cityGroups[city] || cityGroups[city].length === 0) return;

          // Центр НП
          let cityAvgLon = 0,
            cityAvgLat = 0;
          cityGroups[city].forEach((p) => {
            cityAvgLon += p.lon;
            cityAvgLat += p.lat;
          });
          cityAvgLon /= cityGroups[city].length;
          cityAvgLat /= cityGroups[city].length;

          const dist = Math.sqrt(
            Math.pow(avgLon - cityAvgLon, 2) + Math.pow(avgLat - cityAvgLat, 2)
          );

          if (dist < minDist) {
            minDist = dist;
            nearestCityIndex = idx + 1; // Вставляємо після цього НП
          }
        });

        // Вставляємо НП в orderedCities
        orderedCities.splice(nearestCityIndex, 0, unassignedCity);
      });

      // Складаємо всі точки згідно оновленого порядку
      let sortedPoints = [];
      orderedCities.forEach((city) => {
        if (cityGroups[city]) {
          sortedPoints = sortedPoints.concat(cityGroups[city]);
        }
      });

      points = [startPoint, ...sortedPoints]; // ⭐ START завжди перший
    }

    renderList();
    savePointsToStorage();
    calculateRouteStats();
    if (navigator.vibrate) navigator.vibrate([50]);
  }

  function nearestNeighborRoute(pts) {
    if (pts.length === 0) return [];

    let route = [pts[0]];
    let remaining = pts.slice(1);

    while (remaining.length > 0) {
      let last = route[route.length - 1];
      let nearestIdx = 0;
      let minDist = Infinity;

      remaining.forEach((p, i) => {
        let dist = Math.sqrt(
          Math.pow(last.lon - p.lon, 2) + Math.pow(last.lat - p.lat, 2)
        );
        if (dist < minDist) {
          minDist = dist;
          nearestIdx = i;
        }
      });

      route.push(remaining[nearestIdx]);
      remaining.splice(nearestIdx, 1);
    }

    return route;
  }

  function updateStatsUI(meters, seconds) {
    const statsDiv = document.getElementById("header-stats");
    if (!meters || !seconds) {
      statsDiv.style.display = "none";
      return;
    }
    statsDiv.style.display = "flex";

    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const km = (meters / 1000).toFixed(1);

    let timeStr = "";
    if (h > 0) timeStr += `${h} год `;
    timeStr += `${m} хв`;

    document.getElementById("stat-time").innerText = timeStr;
    document.getElementById("stat-dist").innerText = `${km} км`;
  }

  async function addCurrentLocation() {
    if (!navigator.geolocation) return alert("Немає доступу до GPS");

    const btnIcon = document.getElementById("geo-icon");
    const spinner = document.getElementById("geo-spinner");
    btnIcon.style.display = "none";
    spinner.style.display = "block";

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lon = position.coords.longitude;
        const lat = position.coords.latitude;
        const label = await reverseGeocode(lon, lat);

        points.push({ lon, lat, label: "📍 " + label });
        renderList();
        savePointsToStorage();
        btnIcon.style.display = "inline";
        spinner.style.display = "none";

        if (points.length >= 2) {
          calculateRouteStats();
        }
      },
      (err) => {
        alert("GPS помилка");
        btnIcon.style.display = "inline";
        spinner.style.display = "none";
      },
      { enableHighAccuracy: true }
    );
  }

  async function startNavigationApp() {
    if (points.length < 2) return alert("Додайте мінімум 2 точки!");

    if (points.length <= 17) {
      launchSingleRoute(points);
      return;
    }

    const modal = document.getElementById("chunks-modal");
    const list = document.getElementById("chunks-list");
    modal.style.display = "flex";
    list.innerHTML =
      '<div style="text-align:center;padding:20px;">Розраховуємо...</div>';

    routeChunks = splitIntoChunks(points, 17);

    const promises = routeChunks.map(async (chunk, index) => {
      const coords = chunk.map((p) => ({ lon: p.lon, lat: p.lat }));
      const result = await calculateRoute(coords, false);

      if (result) {
        return {
          index,
          distance: result.distance,
          time: result.time,
          launched: false,
        };
      }
      return { index, distance: 0, time: 0, launched: false, error: true };
    });

    Promise.all(promises).then((stats) => {
      chunkStats = stats;
      showChunksModal();
    });
  }

  function splitIntoChunks(points, maxPoints) {
    if (points.length <= maxPoints) return [points];

    const chunks = [];
    let i = 0;

    while (i < points.length) {
      const remaining = points.length - i;

      if (remaining <= maxPoints) {
        chunks.push(points.slice(i));
        break;
      } else {
        chunks.push(points.slice(i, i + maxPoints));
        i += maxPoints - 1;
      }
    }

    return chunks;
  }

  function showChunksModal() {
    const list = document.getElementById("chunks-list");
    list.innerHTML = "";

    let totalDist = 0,
      totalTime = 0;

    routeChunks.forEach((chunk, i) => {
      const stats = chunkStats[i];
      if (!stats.error) {
        totalDist += stats.distance;
        totalTime += stats.time;
      }

      const km = (stats.distance / 1000).toFixed(1);
      const mins = Math.round(stats.time / 60);

      const div = document.createElement("div");
      div.className = "chunk-item";
      div.innerHTML = `
                <div style="flex-grow:1;">
                    <div style="font-weight:700;font-size:16px;margin-bottom:5px;">Частина ${
                      i + 1
                    } з ${routeChunks.length}</div>
                    <div style="font-size:13px;color:#666;">📍 ${
                      chunk.length
                    } точок | 🚗 ${km} км | ⏱️ ${mins} хв</div>
                </div>
                <button class="chunk-btn" id="chunk-btn-${i}" onclick="launchChunk(${i})">▶ Запустити</button>
            `;
      list.appendChild(div);
    });

    const totalKm = (totalDist / 1000).toFixed(1);
    const totalH = Math.floor(totalTime / 3600);
    const totalM = Math.floor((totalTime % 3600) / 60);
    const totalTimeStr =
      totalH > 0 ? `${totalH} год ${totalM} хв` : `${totalM} хв`;

    const summary = document.createElement("div");
    summary.style.cssText =
      "background: #e8f5e9; padding: 15px; border-radius: 10px; margin-top: 10px; font-weight: 600; color: #27ae60;";
    summary.innerHTML = `📊 Загалом: ${totalKm} км, ${totalTimeStr}`;
    list.appendChild(summary);

    const totalPoints = routeChunks.reduce((acc, chunk) => acc + chunk.length, 0);
    const deliveryTotalMins = 3 * totalPoints;
    const deliveryH = Math.floor(deliveryTotalMins / 60);
    const deliveryM = deliveryTotalMins % 60;
    const deliveryTimeStr = deliveryH > 0 ? `${deliveryH}г ${deliveryM}хв` : `${deliveryM}хв`;

    const deliveryBlock = document.createElement('div');
    deliveryBlock.style.cssText = 'background:#e3f2fd;padding:15px;border-radius:10px;margin-top:8px;font-weight:600;color:#1565c0;font-size:14px;';
    deliveryBlock.innerHTML = `📦 Час на доручення: ${deliveryTimeStr} <span style="font-weight:400;font-size:12px;color:#777">(${totalPoints} × 3 хв)</span>`;
    list.appendChild(deliveryBlock);
  }

  function closeChunksModal() {
    document.getElementById("chunks-modal").style.display = "none";
  }

  function launchChunk(index) {
    const chunk = routeChunks[index];
    if (chunk.length === 0) return;

    const start = chunk[0];
    const end = chunk[chunk.length - 1];

    let url =
      "https://mapy.com/fnc/v1/route?start=" +
      start.lon +
      "," +
      start.lat +
      "&end=" +
      end.lon +
      "," +
      end.lat;

    if (chunk.length > 2) {
      const waypoints = chunk.slice(1, -1);
      const waypointsStr = waypoints
        .map(function (p) {
          return p.lon + "," + p.lat;
        })
        .join(";");
      url += "&waypoints=" + waypointsStr;
    }

    url += "&routeType=car_fast";

    console.log("Запускаємо маршрут:", url);
    window.open(url, "_blank");

    chunkStats[index].launched = true;
    const btn = document.getElementById("chunk-btn-" + index);
    btn.textContent = "✓ Запущено";
    btn.classList.add("launched");
    if (navigator.vibrate) navigator.vibrate(50);
  }

  // function launchAllChunks() {
  //   for (let i = 0; i < routeChunks.length; i++) {
  //     setTimeout(() => launchChunk(i), i * 1500);
  //   }
  // }

  async function sendAllChunksToTelegram() {
  if (!routeChunks || routeChunks.length === 0) return alert('Немає розбитих маршрутів!');

  // Будуємо масив посилань
  const links = routeChunks.map((chunk, index) => {
    if (!chunk || chunk.length === 0) return null;

    const start = chunk[0];
    const end = chunk[chunk.length - 1];
    let url = `https://mapy.com/fnc/v1/route?start=${start.lon},${start.lat}&end=${end.lon},${end.lat}`;

    if (chunk.length > 2) {
      const waypoints = chunk.slice(1, -1);
      const waypointsStr = waypoints.map(p => `${p.lon},${p.lat}`).join(';');
      url += `&waypoints=${waypointsStr}`;
    }
    url += '&routeType=carfast';

    const stats = chunkStats[index];
    const km = stats && !stats.error ? (stats.distance / 1000).toFixed(1) : '?';
    const mins = stats && !stats.error ? Math.round(stats.time / 60) : '?';

    return `🗺 Маршрут ${index + 1}/${routeChunks.length} · ${km} км · ${mins} хв\n${url}`;
  }).filter(Boolean);

  if (links.length === 0) return alert('Не вдалося побудувати посилання!');

  const message = `🚗 Розбитий маршрут (${links.length} частин):\n\n` + links.join('\n\n');

  // Відправляємо через Telegram Bot API
  try {
    const response = await fetch(`https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TG_CHAT_ID,
        text: message,
        disable_web_page_preview: true
      })
    });
    const result = await response.json();
    if (result.ok) {
      alert('✅ Маршрути надіслано в Telegram!');
      if (navigator.vibrate) navigator.vibrate([50, 100, 50]);
    } else {
      console.error('TG помилка:', result);
      alert('❌ Помилка надсилання: ' + (result.description || 'невідома'));
    }
  } catch (e) {
    console.error('TG fetch error:', e);
    alert('❌ Не вдалося підключитись до Telegram API');
  }
}


  function launchSingleRoute(routePoints) {
    if (routePoints.length === 0) return;

    const start = routePoints[0];
    const end = routePoints[routePoints.length - 1];

    let url =
      "https://mapy.com/fnc/v1/route?start=" +
      start.lon +
      "," +
      start.lat +
      "&end=" +
      end.lon +
      "," +
      end.lat;

    if (routePoints.length > 2) {
      const waypoints = routePoints.slice(1, -1);
      const waypointsStr = waypoints
        .map(function (p) {
          return p.lon + "," + p.lat;
        })
        .join(";");
      url += "&waypoints=" + waypointsStr;
    }

    url += "&routeType=car_fast";

    console.log("Запускаємо маршрут:", url);
    window.open(url, "_blank");
  }

function navigateToPoint(index) {
  if (index < 0 || index >= points.length) return alert('Точка не знайдена!');

  const point = points[index];
  point.completed = !point.completed;

  savePointsToStorage();
  renderList();

  if (point.completed) {
    const provider = localStorage.getItem('pointOpenProvider') || 'mapy';
    let url = '';

    if (provider === 'google') {
      url = `https://www.google.com/maps/search/?api=1&query=${point.lat},${point.lon}`;
    } else {
      url = `https://mapy.cz/zakladni?x=${point.lon}&y=${point.lat}&source=coor&id=${point.lon},${point.lat}&ds=1`;
    }

    window.open(url, '_blank');
  }

  if (navigator.vibrate) navigator.vibrate(50);
}




// Додайте цю функцію до window об'єкту в init()
window.navigateToPoint = navigateToPoint;


  function init() {
    if (API_KEY === "YOUR_API_KEY_HERE") {
      alert(
        "⚠️ ПОТРІБЕН API КЛЮЧ!\n\nОтримайте безкоштовний ключ на:\nhttps://developer.mapy.com/portal/\n\nПотім вставте його в script.js (рядок 13)"
      );
    }

    const list = document.getElementById("address-list");
    sortable = Sortable.create(list, {
      handle: ".handle",
      animation: 150,
      ghostClass: "sortable-ghost",
      dragClass: "sortable-drag",
      delay: 200,
      delayOnTouchOnly: true,
      touchStartThreshold: 5,
      scroll: true,
      scrollSensitivity: 100,
      scrollSpeed: 10,
      bubbleScroll: true,
      onEnd: function (evt) {
        const item = points.splice(evt.oldIndex, 1)[0];
        points.splice(evt.newIndex, 0, item);
        renderList();
        savePointsToStorage();
        calculateRouteStats();
        // recalcTravelTimes();
      },
    });

    initAutocomplete();
    initCityAutocomplete();
    loadPointsFromStorage();
  }

  function clearAddressInput() {
    const input = document.getElementById("address-input");
    input.value = "";
    const dropdown = document.getElementById("autocomplete-dropdown");
    dropdown.style.display = "none";
    if (window.addressAutocomplete) {
      window.addressAutocomplete.selectedItem = null;
      window.addressAutocomplete.fullAddress = null;
    }
    console.log("🗑️ Поле адреси очищено");
  }

  window.addAddress = addAddress;
  window.addCurrentLocation = addCurrentLocation;
  window.removePoint = removePoint;
  window.clearAllPoints = clearAllPoints;
  window.optimizePointsOrder = optimizePointsOrder;
  window.openMap = openMap;
  window.closeMap = closeMap;
  window.startNavigationApp = startNavigationApp;
  window.closeChunksModal = closeChunksModal;
  window.launchChunk = launchChunk;
  // window.launchAllChunks = launchAllChunks;
  window.sendAllChunksToTelegram = sendAllChunksToTelegram;
  window.closeCityOrderModal = closeCityOrderModal;
  window.applyCityOrder = applyCityOrder;
  window.openCityOrderModal = openCityOrderModal;
  window.clearAddressInput = clearAddressInput;
  window.calculateDistancesToFirst10 = calculateDistancesToFirst10;
  window.openCommentModal = openCommentModal;
  window.closeCommentModal = closeCommentModal;
  window.saveComment = saveComment;
  window.recalcTravelTimes = recalcTravelTimes;


  const token = localStorage.getItem('mapyCzToken');
    console.log("token",token);
    if(token) {
        API_KEY = token !== 'test'? token : "0aIyQ0ASZ3AcgUp5tFkCHMkCFihUJ25iO46sBTuE0Ps";
        init();
    }
        console.log("API_KEY",API_KEY);

  
});

// Функція для згортання/розгортання хедера
function toggleHeaderCollapse() {
    const collapsibleSection = document.getElementById('collapsible-section');
    const goBtn = document.getElementById('nav-btn');
    const actionElement = document.querySelector('.action-grid');
    const collapseIcon = document.getElementById('collapse-icon');
    const isCollapsed = collapsibleSection.style.display === 'none';

    if (isCollapsed) {
        collapsibleSection.style.display = 'block';
        actionElement.style.display = 'grid';
        goBtn.style.display = 'block';
        collapseIcon.textContent = '▲';
        localStorage.setItem('headerCollapsed', 'false');
    } else {
        collapsibleSection.style.display = 'none';
        actionElement.style.display = 'none';
        goBtn.style.display = 'none';
        collapseIcon.textContent = '▼';
        localStorage.setItem('headerCollapsed', 'true');
    }
}

// Відновлення стану при завантаженні сторінки
document.addEventListener('DOMContentLoaded', function() {
    const isCollapsed = localStorage.getItem('headerCollapsed') === 'true';
    if (isCollapsed) {
        document.getElementById('collapsible-section').style.display = 'none';
        document.getElementById('collapse-icon').textContent = '▼';
    }
});
