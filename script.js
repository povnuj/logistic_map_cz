document.addEventListener('DOMContentLoaded', function() {
    
    let map;
    let points = [];
    let sortable;
    let routeChunks = [];
    let chunkStats = [];
    let routeCalculationTimeout = null;
    let citySortable;
    let autocompleteTimeout;
    let mapInitialized = false;


    const STORAGE_KEY = 'mapczRoutePoints';
    const API_BASE = 'https://api.mapy.cz';
    
    const API_KEY = '0aIyQ0ASZ3AcgUp5tFkCHMkCFihUJ25iO46sBTuE0Ps'; 


    // ✅ Geocoding з REST API
    async function geocodeAddress(query) {
        try {
            const url = `${API_BASE}/v1/geocode?query=${encodeURIComponent(query)}&lang=cs&limit=5&apikey=${API_KEY}`;
            console.log('🔍 Geocode запит:', query);
            const response = await fetch(url);
            
            if (!response.ok) {
                console.error('Помилка API:', response.status, response.statusText);
                return [];
            }
            
            const data = await response.json();
            
            if (data.items && data.items.length > 0) {
                console.log('📦 Geocode результати:');
                data.items.forEach((item, i) => {
                    console.log(`  ${i+1}. ${item.name}`);
                });
                return data.items;
            }
            return [];
        } catch (error) {
            console.error('Помилка геокодування:', error);
            return [];
        }
    }


    // ✅ Reverse geocoding з REST API
    async function reverseGeocode(lon, lat) {
        try {
            const url = `${API_BASE}/v1/rgeocode?lon=${lon}&lat=${lat}&lang=cs&apikey=${API_KEY}`;
            const response = await fetch(url);
            
            if (!response.ok) {
                console.error('Помилка API:', response.status);
                return `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
            }
            
            const data = await response.json();
            
            if (data.items && data.items.length > 0) {
                return data.items[0].name || `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
            }
            return `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
        } catch (error) {
            console.error('Помилка зворотного геокодування:', error);
            return `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
        }
    }


    // ✅ Декодування polyline формату
    function decodePolyline(encoded) {
        if (!encoded) return [];
        
        let points = [];
        let index = 0, len = encoded.length;
        let lat = 0, lng = 0;


        while (index < len) {
            let b, shift = 0, result = 0;
            do {
                b = encoded.charCodeAt(index++) - 63;
                result |= (b & 0x1f) << shift;
                shift += 5;
            } while (b >= 0x20);
            let dlat = ((result & 1) ? ~(result >> 1) : (result >> 1));
            lat += dlat;


            shift = 0;
            result = 0;
            do {
                b = encoded.charCodeAt(index++) - 63;
                result |= (b & 0x1f) << shift;
                shift += 5;
            } while (b >= 0x20);
            let dlng = ((result & 1) ? ~(result >> 1) : (result >> 1));
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
                console.log(`⚠️ Забагато точок (${coords.length}), розбиваємо на сегменти...`);
                
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
                        url += '&format=polyline';
                    }
                    
                    if (waypoints.length > 0) {
                        const waypointsStr = waypoints.map(c => `${c.lon},${c.lat}`).join(';');
                        url += `&waypoints=${waypointsStr}`;
                    }
                    
                    console.log(`  Сегмент ${segmentCount}: точки ${i+1}-${end} (${waypoints.length} waypoints)`);
                    
                    try {
                        const response = await fetch(url);
                        
                        if (!response.ok) {
                            console.error(`  ❌ Помилка сегменту ${segmentCount}:`, response.status);
                            continue;
                        }
                        
                        const data = await response.json();
                        
                        if (data.length && data.duration) {
                            totalDistance += data.length;
                            totalTime += data.duration;
                            
                            if (data.geometry && returnGeometry) {
                                const decodedPoints = decodePolyline(data.geometry);
                                allGeometry = allGeometry.concat(decodedPoints);
                                console.log(`  ✅ Сегмент ${segmentCount}: ${(data.length/1000).toFixed(1)} км, geometry: ${decodedPoints.length} точок`);
                            } else {
                                console.log(`  ✅ Сегмент ${segmentCount}: ${(data.length/1000).toFixed(1)} км`);
                            }
                        }
                    } catch (err) {
                        console.error(`  ❌ Помилка запиту сегменту ${segmentCount}:`, err);
                    }
                    
                    await new Promise(resolve => setTimeout(resolve, 300));
                }
                
                if (totalDistance > 0 && totalTime > 0) {
                    console.log(`✅ Загалом: ${(totalDistance/1000).toFixed(1)} км`);
                    
                    if (returnGeometry && allGeometry.length > 0) {
                        return {
                            distance: totalDistance,
                            time: totalTime,
                            geometry: allGeometry
                        };
                    }
                    
                    return {
                        distance: totalDistance,
                        time: totalTime
                    };
                }
                
                return null;
            }
            
            const start = coords[0];
            const end = coords[coords.length - 1];
            const waypoints = coords.slice(1, -1);
            
            let url = `${API_BASE}/v1/routing/route?start=${start.lon},${start.lat}&end=${end.lon},${end.lat}&routeType=car_fast&apikey=${API_KEY}`;
            
            if (returnGeometry) {
                url += '&format=polyline';
            }
            
            if (waypoints.length > 0) {
                const waypointsStr = waypoints.map(c => `${c.lon},${c.lat}`).join(';');
                url += `&waypoints=${waypointsStr}`;
            }
            
            console.log(`📍 Розраховуємо маршрут: ${coords.length} точок (${waypoints.length} waypoints)`);
            
            const response = await fetch(url);
            
            if (!response.ok) {
                console.error('Помилка API:', response.status);
                return null;
            }
            
            const data = await response.json();
            
            if (data.length && data.duration) {
                console.log(`✅ Маршрут: ${(data.length/1000).toFixed(1)} км`);
                
                if (returnGeometry && data.geometry) {
                    const decodedPoints = decodePolyline(data.geometry);
                    console.log(`✅ Geometry декодовано: ${decodedPoints.length} точок`);
                    return {
                        distance: data.length,
                        time: data.duration,
                        geometry: decodedPoints
                    };
                }
                
                return {
                    distance: data.length,
                    time: data.duration
                };
            }
            
            return null;
        } catch (error) {
            console.error('Помилка розрахунку маршруту:', error);
            return null;
        }
    }


    function parseAddress(fullAddress) {
        if (!fullAddress || fullAddress.trim() === '') {
            return { city: 'Невідома адреса', address: '' };
        }
        
        const parts = fullAddress.split(',').map(s => s.trim());
        
        if (parts.length >= 2) {
            let city = parts[1];
            let address = parts[0];
            
            if (parts.length >= 3 && /^\d{3}\s?\d{2}$/.test(parts[2])) {
                address += ', ' + parts[2];
            }
            
            return { city: city, address: address };
        } else {
            return { city: fullAddress, address: '' };
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
            console.log('✅ Точки збережено');
        } catch (e) {
            console.error('❌ Помилка збереження:', e);
        }
    }


    function loadPointsFromStorage() {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                const loadedPoints = JSON.parse(stored);
                
                points = loadedPoints.map(p => {
                    if (p.lon !== undefined && p.lat !== undefined) {
                        return p;
                    }
                    
                    if (p.coords && p.coords.x !== undefined && p.coords.y !== undefined) {
                        console.log('🔄 Міграція старого формату:', p.label);
                        return {
                            lon: p.coords.x,
                            lat: p.coords.y,
                            label: p.label
                        };
                    }
                    
                    if (p.x !== undefined && p.y !== undefined) {
                        console.log('🔄 Міграція формату x/y:', p.label);
                        return {
                            lon: p.x,
                            lat: p.y,
                            label: p.label
                        };
                    }
                    
                    console.warn('⚠️ Невідомий формат точки:', p);
                    return null;
                }).filter(p => p !== null);
                
                console.log(`✅ Завантажено ${points.length} точок`);
                
                savePointsToStorage();
                
                renderList();
                if (points.length >= 2) {
                    calculateRouteStats();
                }
            }
        } catch (e) {
            console.error('❌ Помилка завантаження:', e);
            points = [];
        }
    }


    function clearAllPoints() {
        if (points.length === 0) {
            alert('Список вже порожній!');
            return;
        }
        
        if (confirm(`Видалити всі ${points.length} точок?\nЦя дія незворотна!`)) {
            points = [];
            localStorage.removeItem(STORAGE_KEY);
            renderList();
            document.getElementById("header-stats").style.display = "none";
            console.log('🗑️ Всі точки видалено');
            
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
    
    input.addEventListener("input", function(e) {
        const query = e.target.value.trim();
        window.addressAutocomplete.selectedItem = null;
        window.addressAutocomplete.fullAddress = null;
        
        if (query.length < 3) {
            dropdown.style.display = 'none';
            return;
        }
        
        clearTimeout(autocompleteTimeout);
        
        autocompleteTimeout = setTimeout(async () => {
            console.log('🔍 Шукаємо:', query);
            const results = await geocodeAddress(query);
            
            console.log('📋 Отримано результатів:', results.length);
            
            if (results.length > 0) {
                dropdown.innerHTML = '';
                
                results.forEach((item, index) => {
                    // ✅ Формуємо адресу: "Hvozdnice 115, Hvozdnice, 252 05, Praha-západ"
                    let fullAddress = '';
                    
                    if (item.name) {
                        fullAddress = item.name; // "Hvozdnice 115"
                        
                        // Збираємо тільки потрібні частини з regionalStructure
                        if (item.regionalStructure && item.regionalStructure.length > 0) {
                            const parts = [];
                            
                            // ЗАВЖДИ шукаємо municipality (місто/село)
                            const municipality = item.regionalStructure.find(r => 
                                r.type === 'regional.municipality'
                            );
                            if (municipality && municipality.name) {
                                parts.push(municipality.name); // Завжди додаємо, навіть якщо співпадає
                            }
                            
                            // Додаємо PSČ якщо є
                            if (item.zip) {
                                parts.push(item.zip);
                            }
                            
                            // Шукаємо район (Praha-západ, okres Praha-západ тощо)
                            const district = item.regionalStructure.find(r => 
                                r.type === 'regional.region' && 
                                (r.name.includes('Praha') || r.name.includes('okres'))
                            );
                            if (district && district.name) {
                                // Прибираємо слово "okres " якщо є
                                const districtName = district.name.replace(/^okres\s+/i, '');
                                parts.push(districtName);
                            }
                            
                            if (parts.length > 0) {
                                fullAddress += ', ' + parts.join(', ');
                            }
                        } else if (item.zip) {
                            // Якщо немає regionalStructure але є PSČ
                            fullAddress += ', ' + item.zip;
                        }
                    } else if (item.label) {
                        fullAddress = item.label;
                    } else {
                        fullAddress = 'Невідома адреса';
                    }
                    
                    console.log(`➕ Додаємо в dropdown: "${fullAddress}"`);
                    
                    const div = document.createElement('div');
                    div.className = 'autocomplete-item';
                    div.textContent = fullAddress;
                    
                    div.onclick = function() {
                        console.log('✅ Клік на:', fullAddress);
                        
                        input.value = fullAddress;
                        window.addressAutocomplete.selectedItem = item;
                        window.addressAutocomplete.fullAddress = fullAddress;
                        dropdown.style.display = 'none';
                        console.log('✅ Input встановлено:', input.value);
                    };
                    
                    dropdown.appendChild(div);
                });
                
                dropdown.style.display = 'block';
                console.log('✅ Dropdown показано');
            } else {
                dropdown.style.display = 'none';
                console.log('⚠️ Результатів не знайдено');
            }
        }, 500);
    });
    
    input.addEventListener("keypress", function(e) {
        if (e.key === "Enter") {
            dropdown.style.display = 'none';
            window.addAddress();
        }
    });
    
    document.addEventListener("click", function(e) {
        if (!input.contains(e.target) && !dropdown.contains(e.target)) {
            dropdown.style.display = 'none';
        }
    });
}





async function addAddress() {
    const input = document.getElementById("address-input");
    const val = input.value.trim();
    if (!val) return;

    console.log('🔵 addAddress викликано з val:', val);

    let coords = null;
    let finalLabel = val;
    
    // Перевіряємо чи є збережений item
    if (window.addressAutocomplete && window.addressAutocomplete.selectedItem) {
        console.log('✅ Є збережений selectedItem');
        
        const item = window.addressAutocomplete.selectedItem;
        
        // ✅ API повертає position, а не location!
        if (item.position && item.position.lon && item.position.lat) {
            coords = {
                lon: item.position.lon,
                lat: item.position.lat
            };
            console.log('✅ Координати з position:', coords);
            
            // Використовуємо збережену адресу
            if (window.addressAutocomplete.fullAddress) {
                finalLabel = window.addressAutocomplete.fullAddress;
            }
        } else if (item.location && item.location.lon && item.location.lat) {
            // Запасний варіант якщо буде location
            coords = {
                lon: item.location.lon,
                lat: item.location.lat
            };
            console.log('✅ Координати з location:', coords);
            
            if (window.addressAutocomplete.fullAddress) {
                finalLabel = window.addressAutocomplete.fullAddress;
            }
        } else {
            console.error('❌ selectedItem не має position/location:', item);
        }
        
        // Очищуємо
        window.addressAutocomplete.selectedItem = null;
        window.addressAutocomplete.fullAddress = null;
        
    } else {
        console.log('⚠️ Немає selectedItem, виконуємо geocode');
        const results = await geocodeAddress(val);
        
        console.log('📦 Geocode результати:', results);
        
        if (results.length > 0) {
            const item = results[0];
            
            console.log('📍 Використовуємо перший результат:', item);
            
            // ✅ Перевіряємо position або location
            if (item.position && item.position.lon && item.position.lat) {
                coords = {
                    lon: item.position.lon,
                    lat: item.position.lat
                };
                console.log('✅ Координати з position:', coords);
            } else if (item.location && item.location.lon && item.location.lat) {
                coords = {
                    lon: item.location.lon,
                    lat: item.location.lat
                };
                console.log('✅ Координати з location:', coords);
            } else {
                console.error('❌ item не має position/location:', item);
            }
            
            if (coords) {
                // ✅ Формуємо повну адресу
                finalLabel = item.name;
                
                if (item.regionalStructure && item.regionalStructure.length > 0) {
                    const parts = [];
                    
                    const municipality = item.regionalStructure.find(r => 
                        r.type === 'regional.municipality'
                    );
                    if (municipality && municipality.name) {
                        parts.push(municipality.name);
                    }
                    
                    if (item.zip) {
                        parts.push(item.zip);
                    }
                    
                    const district = item.regionalStructure.find(r => 
                        r.type === 'regional.region' && 
                        (r.name.includes('Praha') || r.name.includes('okres'))
                    );
                    if (district && district.name) {
                        const districtName = district.name.replace(/^okres\s+/i, '');
                        parts.push(districtName);
                    }
                    
                    if (parts.length > 0) {
                        finalLabel += ', ' + parts.join(', ');
                    }
                } else if (item.zip) {
                    finalLabel += ', ' + item.zip;
                }
                
                console.log('✅ Сформована адреса:', finalLabel);
            }
        } else {
            console.error('❌ Geocode повернув 0 результатів');
        }
    }
    
    if (coords) {
        points.push({
            lon: coords.lon,
            lat: coords.lat,
            label: finalLabel
        });
        
        console.log('✅ Точку додано до масиву:', {
            lon: coords.lon,
            lat: coords.lat,
            label: finalLabel
        });
        
        renderList();
        savePointsToStorage();
        input.value = "";
        
        if (points.length >= 2) {
            calculateRouteStats();
        } else {
            document.getElementById("header-stats").style.display = "none";
        }
    } else {
        console.error('❌ coords = null, точку НЕ додано');
        alert("Не знайдено цю адресу");
    }
}


    function renderList() {
        const list = document.getElementById("address-list");
        list.innerHTML = "";
        
        const duplicates = findDuplicates();
        
        points.forEach((p, i) => {
            const parsed = parseAddress(p.label);
            const li = document.createElement("li");
            
            if (duplicates.has(i)) {
                li.classList.add('duplicate');
            }
            
            let addressHTML = `<div class="city-name">${parsed.city}</div>`;
            if (parsed.address) {
                addressHTML += `<div class="address-detail">${parsed.address}</div>`;
            }
            
            const duplicateBadge = duplicates.has(i) ? '<span class="duplicate-badge">⚠️ ДУБЛІКАТ</span>' : '';
            
            li.innerHTML = `
                <div class="handle">☰</div>
                <div class="badge">${i+1}</div>
                <div class="text">
                    ${addressHTML}
                </div>
                ${duplicateBadge}
                <div class="del" onclick="removePoint(${i})">✕</div>
            `;
            list.appendChild(li);
        });


        document.getElementById("count").innerText = points.length;
    }


    function removePoint(i) {
        points.splice(i, 1);
        renderList();
        savePointsToStorage();
        
        if (points.length >= 2) {
            calculateRouteStats();
        } else {
            document.getElementById("header-stats").style.display = "none";
        }
    }


    function initMap() {
        map = L.map('map-container').setView([49.8, 15.4], 7);
        
        L.tileLayer(`https://api.mapy.cz/v1/maptiles/basic/256/{z}/{x}/{y}?apikey=${API_KEY}`, {
            minZoom: 2,
            maxZoom: 19,
            attribution: '&copy; <a href="https://mapy.cz">Mapy.cz</a>'
        }).addTo(map);
        
        mapInitialized = true;
        console.log('✅ Карта ініціалізована');
    }


    async function openMap() {
        if (points.length === 0) return alert("Спочатку додайте точки!");
        
        document.getElementById("map-container").style.display = "block";
        document.getElementById("close-map-btn").style.display = "flex";
        
        if (!mapInitialized) {
            initMap();
        }
        
        await new Promise(resolve => setTimeout(resolve, 100));
        
        map.invalidateSize();
        
        map.eachLayer((layer) => {
            if (layer instanceof L.Marker || layer instanceof L.Polyline) {
                map.removeLayer(layer);
            }
        });
        
        const markers = [];
        points.forEach((p, i) => {
            const marker = L.marker([p.lat, p.lon])
                .bindPopup(`<b>${i+1}. ${p.label}</b>`)
                .addTo(map);
            markers.push(marker);
        });
        
        if (points.length > 1) {
            console.log('🗺️ Завантажуємо геометрію маршруту...');
            
            const coords = points.map(p => ({ lon: p.lon, lat: p.lat }));
            const routeData = await calculateRoute(coords, true);
            
            if (routeData && routeData.geometry && routeData.geometry.length > 0) {
                console.log(`✅ Геометрія завантажена: ${routeData.geometry.length} точок`);
                
                L.polyline(routeData.geometry, {
                    color: '#e74c3c',
                    weight: 5,
                    opacity: 0.8,
                    smoothFactor: 1
                }).addTo(map);
                
                console.log('✅ Маршрут намальовано на карті');
            } else {
                console.warn('⚠️ Не вдалося завантажити геометрію, малюємо пряму лінію');
                
                const routeCoords = points.map(p => [p.lat, p.lon]);
                L.polyline(routeCoords, {
                    color: '#95a5a6',
                    weight: 3,
                    opacity: 0.6,
                    dashArray: '10, 10'
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
            console.log('🔄 Розраховуємо маршрут...');
            
            const coords = points.map(p => ({ lon: p.lon, lat: p.lat }));
            const result = await calculateRoute(coords, false);
            
            if (result) {
                console.log('✅ Маршрут розраховано:', result);
                updateStatsUI(result.distance, result.time);
                statsDiv.classList.remove("loading");
            } else {
                console.error('❌ Помилка розрахунку');
                statsDiv.style.display = "none";
                statsDiv.classList.remove("loading");
            }
        }, 500);
    }


    function openCityOrderModal() {
        if (points.length < 3) return alert("Треба мінімум 3 точки");
        
        const cityGroups = {};
        points.forEach((p) => {
            const city = p.label.split(',')[1]?.trim() || 'Інше';
            if (!cityGroups[city]) cityGroups[city] = [];
            cityGroups[city].push(p);
        });
        
        const cityNames = Object.keys(cityGroups);
        
        if (cityNames.length < 2) {
            return alert("Всі точки в одному населеному пункті");
        }
        
        const modal = document.getElementById('city-order-modal');
        const list = document.getElementById('city-order-list');
        modal.style.display = 'flex';
        list.innerHTML = '';
        
        cityNames.forEach((city, index) => {
            const count = cityGroups[city].length;
            const div = document.createElement('div');
            div.className = 'city-order-item';
            div.setAttribute('data-city', city);
            div.innerHTML = `
                <div class="city-handle">☰</div>
                <div class="city-badge">${index + 1}</div>
                <div class="city-info">
                    <div class="city-title">${city}</div>
                    <div class="city-count">${count} точок</div>
                </div>
            `;
            list.appendChild(div);
        });
        
        if (citySortable) citySortable.destroy();
        citySortable = Sortable.create(list, {
            handle: '.city-handle',
            animation: 150,
            ghostClass: 'sortable-ghost',
            onEnd: function() {
                const items = document.querySelectorAll('.city-order-item');
                items.forEach((item, idx) => {
                    item.querySelector('.city-badge').textContent = idx + 1;
                });
            }
        });
    }


    function closeCityOrderModal() {
        document.getElementById('city-order-modal').style.display = 'none';
    }


    function applyCityOrder() {
        const items = document.querySelectorAll('.city-order-item');
        const orderedCities = Array.from(items).map(item => item.getAttribute('data-city'));
        
        closeCityOrderModal();
        
        const cityGroups = {};
        points.forEach((p) => {
            const city = p.label.split(',')[1]?.trim() || 'Інше';
            if (!cityGroups[city]) cityGroups[city] = [];
            cityGroups[city].push(p);
        });
        
        for (let city in cityGroups) {
            cityGroups[city] = nearestNeighborRoute(cityGroups[city]);
        }
        
        let sortedPoints = [];
        orderedCities.forEach(city => {
            if (cityGroups[city]) sortedPoints = sortedPoints.concat(cityGroups[city]);
        });
        
        points = sortedPoints;
        renderList();
        savePointsToStorage();
        calculateRouteStats();
        if (navigator.vibrate) navigator.vibrate(50);
    }


    function optimizePointsOrder() {
        if (points.length < 3) return alert("Треба мінімум 3 точки");
        
        const cities = new Set();
        points.forEach(p => cities.add(p.label.split(',')[1]?.trim() || 'Інше'));
        
        if (cities.size > 1) {
            openCityOrderModal();
            return;
        }
        
        let route = nearestNeighborRoute(points);
        points = route;
        renderList();
        savePointsToStorage();
        calculateRouteStats();
        if (navigator.vibrate) navigator.vibrate(50);
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
                    Math.pow(last.lon - p.lon, 2) + 
                    Math.pow(last.lat - p.lat, 2)
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
        
        const modal = document.getElementById('chunks-modal');
        const list = document.getElementById('chunks-list');
        modal.style.display = 'flex';
        list.innerHTML = '<div style="text-align:center;padding:20px;">Розраховуємо...</div>';
        
        routeChunks = splitIntoChunks(points, 17);
        
        const promises = routeChunks.map(async (chunk, index) => {
            const coords = chunk.map(p => ({ lon: p.lon, lat: p.lat }));
            const result = await calculateRoute(coords, false);
            
            if (result) {
                return {
                    index,
                    distance: result.distance,
                    time: result.time,
                    launched: false
                };
            }
            return { index, distance: 0, time: 0, launched: false, error: true };
        });
        
        Promise.all(promises).then(stats => {
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
        const list = document.getElementById('chunks-list');
        list.innerHTML = '';
        
        let totalDist = 0, totalTime = 0;
        
        routeChunks.forEach((chunk, i) => {
            const stats = chunkStats[i];
            if (!stats.error) {
                totalDist += stats.distance;
                totalTime += stats.time;
            }
            
            const km = (stats.distance / 1000).toFixed(1);
            const mins = Math.round(stats.time / 60);
            
            const div = document.createElement('div');
            div.className = 'chunk-item';
            div.innerHTML = `
                <div style="flex-grow:1;">
                    <div style="font-weight:700;font-size:16px;margin-bottom:5px;">Частина ${i + 1} з ${routeChunks.length}</div>
                    <div style="font-size:13px;color:#666;">📍 ${chunk.length} точок | 🚗 ${km} км | ⏱️ ${mins} хв</div>
                </div>
                <button class="chunk-btn" id="chunk-btn-${i}" onclick="launchChunk(${i})">▶ Запустити</button>
            `;
            list.appendChild(div);
        });
        
        const totalKm = (totalDist / 1000).toFixed(1);
        const totalH = Math.floor(totalTime / 3600);
        const totalM = Math.floor((totalTime % 3600) / 60);
        const totalTimeStr = totalH > 0 ? `${totalH} год ${totalM} хв` : `${totalM} хв`;
        
        const summary = document.createElement('div');
        summary.style.cssText = 'background: #e8f5e9; padding: 15px; border-radius: 10px; margin-top: 10px; font-weight: 600; color: #27ae60;';
        summary.innerHTML = `📊 Загалом: ${totalKm} км, ${totalTimeStr}`;
        list.appendChild(summary);
    }


    function closeChunksModal() {
        document.getElementById('chunks-modal').style.display = 'none';
    }


    function launchChunk(index) {
    const chunk = routeChunks[index];
    if (chunk.length === 0) return;

    const start = chunk[0];
    const end = chunk[chunk.length - 1];

    let url = 'https://mapy.com/fnc/v1/route?start=' + start.lon + ',' + start.lat + '&end=' + end.lon + ',' + end.lat;

    if (chunk.length > 2) {
        const waypoints = chunk.slice(1, -1);
        const waypointsStr = waypoints.map(function(p) { return p.lon + ',' + p.lat; }).join(';');
        url += '&waypoints=' + waypointsStr;
    }

    url += '&routeType=car_fast';

    console.log('Запускаємо маршрут:', url);
    window.open(url, '_blank');

    chunkStats[index].launched = true;
    const btn = document.getElementById('chunk-btn-' + index);
    btn.textContent = '✓ Запущено';
    btn.classList.add('launched');
    if (navigator.vibrate) navigator.vibrate(50);
}


    function launchAllChunks() {
        for (let i = 0; i < routeChunks.length; i++) {
            setTimeout(() => launchChunk(i), i * 1500);
        }
    }


    function launchSingleRoute(routePoints) {
    if (routePoints.length === 0) return;

    const start = routePoints[0];
    const end = routePoints[routePoints.length - 1];

    let url = 'https://mapy.com/fnc/v1/route?start=' + start.lon + ',' + start.lat + '&end=' + end.lon + ',' + end.lat;

    if (routePoints.length > 2) {
        const waypoints = routePoints.slice(1, -1);
        const waypointsStr = waypoints.map(function(p) { return p.lon + ',' + p.lat; }).join(';');
        url += '&waypoints=' + waypointsStr;
    }

    url += '&routeType=car_fast';

    console.log('Запускаємо маршрут:', url);
    window.open(url, '_blank');
}


    function init() {
        if (API_KEY === 'YOUR_API_KEY_HERE') {
            alert('⚠️ ПОТРІБЕН API КЛЮЧ!\n\nОтримайте безкоштовний ключ на:\nhttps://developer.mapy.com/portal/\n\nПотім вставте його в script.js (рядок 13)');
        }
        
        const list = document.getElementById('address-list');
        sortable = Sortable.create(list, {
            handle: '.handle',
            animation: 150,
            ghostClass: 'sortable-ghost',
            dragClass: 'sortable-drag',
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
            }
        });


        initAutocomplete();
        loadPointsFromStorage();
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
    window.launchAllChunks = launchAllChunks;
    window.closeCityOrderModal = closeCityOrderModal;
    window.applyCityOrder = applyCityOrder;


    init();
});
