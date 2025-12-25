let m, routeLayer, markerLayer;
        let points = [];
        let suggest;
        let mapInitialized = false;
        let lastSuggestedCoords = null;
        let sortable; 
        let routeChunks = [];
        let chunkStats = [];
        let routeCalculationTimeout = null;
        let citySortable; // Для drag-and-drop міст




        const STORAGE_KEY = 'mapczRoutePoints';




        function parseAddress(fullAddress) {
            if (!fullAddress || fullAddress.trim() === '') {
                return {
                    city: 'Невідома адреса',
                    address: ''
                };
            }

            const parts = fullAddress.split(',').map(s => s.trim());

            if (parts.length >= 2) {
                let city = parts[1];
                let address = parts[0];

                if (parts.length >= 3 && /^\d{3}\s?\d{2}$/.test(parts[2])) {
                    address += ', ' + parts[2];
                }

                return {
                    city: city,
                    address: address
                };
            } else {
                return {
                    city: fullAddress,
                    address: ''
                };
            }
        }




        function findDuplicates() {
            const duplicates = new Set();
            const seen = new Map();

            points.forEach((p, index) => {
                const key = `${p.coords.x.toFixed(4)},${p.coords.y.toFixed(4)}`;

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
                const simplePoints = points.map(p => ({
                    x: p.coords.x,
                    y: p.coords.y,
                    label: p.label
                }));
                localStorage.setItem(STORAGE_KEY, JSON.stringify(simplePoints));
                console.log('✅ Точки збережено в localStorage');
            } catch (e) {
                console.error('❌ Помилка збереження:', e);
            }
        }




        function loadPointsFromStorage() {
            try {
                const stored = localStorage.getItem(STORAGE_KEY);
                if (stored) {
                    const simplePoints = JSON.parse(stored);
                    points = simplePoints.map(p => ({
                        coords: SMap.Coords.fromWGS84(p.x, p.y),
                        label: p.label
                    }));
                    console.log(`✅ Завантажено ${points.length} точок з localStorage`);
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




        function init() {
            const input = document.getElementById("address-input");

            suggest = new SMap.Suggest(input, {
                provider: new SMap.SuggestProvider({
                    updateParams: params => { params.count = 5; params.lang = 'uk'; }
                })
            });

            suggest.addListener("suggest", (suggestData) => {
                const data = suggestData.data;
                lastSuggestedCoords = SMap.Coords.fromWGS84(data.longitude, data.latitude);

                setTimeout(() => {
                    new SMap.Geocoder.Reverse(lastSuggestedCoords, (geocoder) => {
                        const results = geocoder.getResults();

                        if (results && results.label) {
                            input.value = results.label;
                            console.log('✅ Оновлено інпут:', results.label);
                        }
                    });
                }, 100);
            });




            input.addEventListener("keypress", function(e) {
                if (e.key === "Enter") addAddress();
            });




            const list = document.getElementById('address-list');
            sortable = Sortable.create(list, {
                handle: '.handle',
                animation: 150,
                ghostClass: 'sortable-ghost',
                dragClass: 'sortable-drag',
                delay: 200,
                delayOnTouchOnly: true,
                touchStartThreshold: 5,
                forceFallback: false,
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




            loadPointsFromStorage();
        }




        async function addAddress() {
            const input = document.getElementById("address-input");
            const val = input.value.trim();
            if (!val) return;




            let coords = null;
            let label = val;




            if (lastSuggestedCoords) {
                coords = lastSuggestedCoords;
                lastSuggestedCoords = null;
            } else {
                const res = await geocode(val);
                if (!res) return;
                coords = res.coords;
                label = res.label;
            }




            console.log('✅ Додаємо точку:', label);
            points.push({ coords, label });
            renderList();
            savePointsToStorage();
            input.value = "";

            if (points.length >= 2) {
                calculateRouteStats();
            } else {
                document.getElementById("header-stats").style.display = "none";
            }
        }




        function geocode(addr) {
            return new Promise(resolve => {
                new SMap.Geocoder(addr, g => {
                    const results = g.getResults()[0];
                    if (results && results.results && results.results.length > 0) {
                        const result = results.results[0];
                        let label = result.label || addr;

                        resolve({ 
                            coords: result.coords, 
                            label: label
                        });
                    } else { 
                        alert("Не знайдено цю адресу"); 
                        resolve(null); 
                    }
                });
            });
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
            const center = SMap.Coords.fromWGS84(15.4, 49.8);
            m = new SMap(document.getElementById("map-container"), center, 7);
            m.addDefaultLayer(SMap.DEF_BASE).enable();
            m.addDefaultControls();
            routeLayer = new SMap.Layer.Geometry(); m.addLayer(routeLayer); routeLayer.enable();
            markerLayer = new SMap.Layer.Marker(); m.addLayer(markerLayer); markerLayer.enable();
        }




        function openMap() {
            if (points.length === 0) return alert("Спочатку додайте точки!");
            document.getElementById("map-container").style.display = "block";
            document.getElementById("close-map-btn").style.display = "flex";
            if (!mapInitialized) { initMap(); mapInitialized = true; }
            calculateRoute();
        }




        function closeMap() {
            document.getElementById("map-container").style.display = "none";
            document.getElementById("close-map-btn").style.display = "none";
        }




        function calculateRoute(isBackground = false) {
            if (points.length < 2) return;
            const coords = points.map(p => p.coords);

            SMap.Route.route(coords, { geometry: true, criterion: 'short' }).then(route => {
                const results = route.getResults();
                updateStatsUI(results.length, results.time);




                if (!isBackground) {
                    if (!mapInitialized) { initMap(); mapInitialized = true; }
                    markerLayer.removeAll(); routeLayer.removeAll();
                    points.forEach((p, i) => {
                        markerLayer.addMarker(new SMap.Marker(p.coords, null, { title: `${i+1}` }));
                    });
                    routeLayer.addGeometry(new SMap.Geometry(SMap.GEOMETRY_POLYLINE, null, results.geometry));
                    const z = m.computeCenterZoom(coords);
                    m.setCenterZoom(z[0], z[1]);
                }
            });
        }




        function calculateRouteStats() {
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




            routeCalculationTimeout = setTimeout(() => {
                const coords = points.map(p => p.coords);

                console.log('🔄 Розраховуємо маршрут...');

                SMap.Route.route(coords, { geometry: true, criterion: 'fast' })
                    .then(route => {
                        const results = route.getResults();
                        console.log('✅ Маршрут розраховано:', results);
                        updateStatsUI(results.length, results.time);
                        statsDiv.classList.remove("loading");
                    })
                    .catch(err => {
                        console.error('❌ Помилка розрахунку:', err);
                        statsDiv.style.display = "none";
                        statsDiv.classList.remove("loading");
                    });
            }, 500);
        }




        // ✅ НОВА ФУНКЦІЯ: Відкрити модалку для зміни порядку міст
        function openCityOrderModal() {
            if (points.length < 3) return alert("Треба мінімум 3 точки");

            // Групуємо точки по містах
            const cityGroups = {};
            points.forEach((p, idx) => {
                const city = p.label.split(',')[1]?.trim() || 'Інше';
                if (!cityGroups[city]) {
                    cityGroups[city] = [];
                }
                cityGroups[city].push({ point: p, originalIndex: idx });
            });

            const cityNames = Object.keys(cityGroups);

            if (cityNames.length < 2) {
                return alert("Всі точки в одному населеному пункті. Оптимізація не потрібна.");
            }

            // Відображаємо модалку
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

            // Ініціалізуємо Sortable для міст
            if (citySortable) citySortable.destroy();
            citySortable = Sortable.create(list, {
                handle: '.city-handle',
                animation: 150,
                ghostClass: 'sortable-ghost',
                onEnd: function() {
                    updateCityBadges();
                }
            });

            console.log('🗺️ Відкрито модалку зміни порядку міст');
        }




        // ✅ НОВА ФУНКЦІЯ: Оновити номери міст після переміщення
        function updateCityBadges() {
            const items = document.querySelectorAll('.city-order-item');
            items.forEach((item, index) => {
                const badge = item.querySelector('.city-badge');
                badge.textContent = index + 1;
            });
        }




        // ✅ НОВА ФУНКЦІЯ: Закрити модалку порядку міст
        function closeCityOrderModal() {
            document.getElementById('city-order-modal').style.display = 'none';
        }




        // ✅ НОВА ФУНКЦІЯ: Застосувати порядок міст і запустити оптимізацію
        function applyCityOrder() {
            const items = document.querySelectorAll('.city-order-item');
            const orderedCities = Array.from(items).map(item => item.getAttribute('data-city'));

            console.log('✅ Застосовано порядок міст:', orderedCities);

            // Закриваємо модалку
            closeCityOrderModal();

            // Запускаємо оптимізацію з вказаним порядком міст
            optimizePointsOrderWithCities(orderedCities);
        }




        // ✅ ОНОВЛЕНА ФУНКЦІЯ: 2-OPT ОПТИМІЗАЦІЯ З УРАХУВАННЯМ ПОРЯДКУ МІСТ
        function optimizePointsOrderWithCities(orderedCities) {
            console.log('🔄 Початок оптимізації з заданим порядком міст...');

            // Групуємо точки по містах
            const cityGroups = {};
            points.forEach((p) => {
                const city = p.label.split(',')[1]?.trim() || 'Інше';
                if (!cityGroups[city]) {
                    cityGroups[city] = [];
                }
                cityGroups[city].push(p);
            });

            // Сортуємо всередині кожного міста методом найближчого сусіда
            for (let city in cityGroups) {
                cityGroups[city] = nearestNeighborRoute(cityGroups[city]);
            }

            // Збираємо точки в порядку міст
            let sortedPoints = [];
            orderedCities.forEach(city => {
                if (cityGroups[city]) {
                    sortedPoints = sortedPoints.concat(cityGroups[city]);
                }
            });

            // 2-opt покращення загального маршруту
            let route = sortedPoints;
            let initialDistance = calculateTotalDistance(route);
            console.log(`📍 Початкова відстань: ${(initialDistance/1000).toFixed(2)} км`);

            let improved = true;
            let iterations = 0;
            const maxIterations = 1000;

            while (improved && iterations < maxIterations) {
                improved = false;
                iterations++;

                for (let i = 1; i < route.length - 1; i++) {
                    for (let j = i + 1; j < route.length; j++) {
                        let newRoute = twoOptSwap(route, i, j);
                        let currentDist = calculateTotalDistance(route);
                        let newDist = calculateTotalDistance(newRoute);

                        if (newDist < currentDist) {
                            route = newRoute;
                            improved = true;
                        }
                    }
                }
            }

            let finalDistance = calculateTotalDistance(route);
            let improvement = ((initialDistance - finalDistance) / initialDistance * 100).toFixed(1);

            console.log(`✅ Оптимізація завершена за ${iterations} ітерацій`);
            console.log(`📍 Кінцева відстань: ${(finalDistance/1000).toFixed(2)} км`);
            console.log(`📈 Покращення: ${improvement}%`);

            points = route;
            renderList();
            savePointsToStorage();
            calculateRouteStats();
            if (navigator.vibrate) navigator.vibrate(50);
        }




        // ✅ ОРИГІНАЛЬНА ФУНКЦІЯ: 2-OPT ОПТИМІЗАЦІЯ (БЕЗ МОДАЛКИ)
        function optimizePointsOrder() {
            if (points.length < 3) return alert("Треба мінімум 3 точки");

            // Перевіряємо, чи є різні міста
            const cities = new Set();
            points.forEach(p => {
                const city = p.label.split(',')[1]?.trim() || 'Інше';
                cities.add(city);
            });

            // Якщо є більше 1 міста - відкриваємо модалку
            if (cities.size > 1) {
                openCityOrderModal();
                return;
            }

            // Якщо одне місто - просто оптимізуємо
            console.log('🔄 Початок 2-opt оптимізації маршруту...');

            let route = nearestNeighborRoute(points);
            let initialDistance = calculateTotalDistance(route);
            console.log(`📍 Початкова відстань: ${(initialDistance/1000).toFixed(2)} км`);

            let improved = true;
            let iterations = 0;
            const maxIterations = 1000;

            while (improved && iterations < maxIterations) {
                improved = false;
                iterations++;

                for (let i = 1; i < route.length - 1; i++) {
                    for (let j = i + 1; j < route.length; j++) {
                        let newRoute = twoOptSwap(route, i, j);
                        let currentDist = calculateTotalDistance(route);
                        let newDist = calculateTotalDistance(newRoute);

                        if (newDist < currentDist) {
                            route = newRoute;
                            improved = true;
                        }
                    }
                }
            }

            let finalDistance = calculateTotalDistance(route);
            let improvement = ((initialDistance - finalDistance) / initialDistance * 100).toFixed(1);

            console.log(`✅ Оптимізація завершена за ${iterations} ітерацій`);
            console.log(`📍 Кінцева відстань: ${(finalDistance/1000).toFixed(2)} км`);
            console.log(`📈 Покращення: ${improvement}%`);

            points = route;
            renderList();
            savePointsToStorage();
            calculateRouteStats();
            if (navigator.vibrate) navigator.vibrate(50);
        }




        // Допоміжна функція: Nearest Neighbor для початкового маршруту
        function nearestNeighborRoute(pts) {
            if (pts.length === 0) return [];

            let route = [pts[0]];
            let remaining = pts.slice(1);

            while (remaining.length > 0) {
                let last = route[route.length - 1];
                let nearestIdx = 0;
                let minDist = Infinity;

                remaining.forEach((p, i) => {
                    let dist = last.coords.distance(p.coords);
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




        // Допоміжна функція: 2-opt swap (розворот сегменту маршруту)
        function twoOptSwap(route, i, j) {
            let newRoute = route.slice(0, i);
            let reversed = route.slice(i, j + 1).reverse();
            let end = route.slice(j + 1);
            return newRoute.concat(reversed, end);
        }




        // Допоміжна функція: розрахунок загальної відстані маршруту
        function calculateTotalDistance(route) {
            if (route.length < 2) return 0;

            let total = 0;
            for (let i = 0; i < route.length - 1; i++) {
                total += route[i].coords.distance(route[i + 1].coords);
            }
            return total;
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




        function addCurrentLocation() {
            if (!navigator.geolocation) return alert("Немає доступу до GPS");
            const btnIcon = document.getElementById("geo-icon");
            const spinner = document.getElementById("geo-spinner");
            btnIcon.style.display = "none"; spinner.style.display = "block";




            navigator.geolocation.getCurrentPosition(
                (position) => {
                    const coords = SMap.Coords.fromWGS84(position.coords.longitude, position.coords.latitude);
                    new SMap.Geocoder.Reverse(coords, (geocoder) => {
                        const results = geocoder.getResults();
                        let label = results.label || `${coords.y.toFixed(5)}, ${coords.x.toFixed(5)}`;

                        points.push({ coords: coords, label: "📍 " + label });
                        renderList();
                        savePointsToStorage();
                        btnIcon.style.display = "inline"; spinner.style.display = "none";

                        if (points.length >= 2) {
                            calculateRouteStats();
                        }
                    });
                },
                (err) => { 
                    alert("GPS помилка"); 
                    btnIcon.style.display = "inline"; spinner.style.display = "none"; 
                },
                { enableHighAccuracy: true }
            );
        }




        function startNavigationApp() {
            if (points.length < 2) return alert("Додайте мінімум 2 точки!");

            if (points.length <= 17) {
                launchSingleRoute(points);
                return;
            }

            const modal = document.getElementById('chunks-modal');
            const list = document.getElementById('chunks-list');
            modal.style.display = 'flex';
            list.innerHTML = '<div class="loading-indicator"><div class="loading-spinner"></div><div>Розраховуємо маршрути...</div></div>';

            routeChunks = splitIntoChunks(points, 17);

            console.log(`🔄 Розраховуємо ${routeChunks.length} частин маршруту...`);

            const promises = routeChunks.map((chunk, index) => {
                const coords = chunk.map(p => p.coords);
                console.log(`  Частина ${index + 1}: ${chunk.length} точок`);

                return SMap.Route.route(coords, { geometry: true, criterion: 'fast' })
                    .then(route => {
                        const results = route.getResults();

                        console.log(`  ✅ Частина ${index + 1}:`, results);

                        let distance = results.length || 0;
                        let time = results.time || 0;

                        console.log(`  📊 ${(distance/1000).toFixed(1)} км, ${Math.round(time/60)} хв`);

                        return {
                            index: index,
                            distance: distance,
                            time: time,
                            launched: false
                        };
                    })
                    .catch(err => {
                        console.error(`  ❌ Помилка в частині ${index + 1}:`, err);
                        return {
                            index: index,
                            distance: 0,
                            time: 0,
                            launched: false,
                            error: true
                        };
                    });
            });

            Promise.all(promises).then(stats => {
                chunkStats = stats;
                console.log('✅ Всі частини розраховано:', chunkStats);
                showChunksModal();
            }).catch(err => {
                console.error('❌ Помилка розрахунку:', err);
                list.innerHTML = '<div class="loading-indicator" style="color: #e74c3c;">❌ Помилка розрахунку маршруту</div>';
            });
        }




        function splitIntoChunks(points, maxPoints) {
            if (points.length <= maxPoints) {
                return [points];
            }

            const chunks = [];
            let i = 0;

            while (i < points.length) {
                const remainingPoints = points.length - i;

                if (remainingPoints <= maxPoints) {
                    chunks.push(points.slice(i));
                    break;
                } else {
                    chunks.push(points.slice(i, i + maxPoints));
                    i += maxPoints - 1;
                }
            }

            console.log('🔧 Розбиття на частини:');
            chunks.forEach((chunk, idx) => {
                console.log(`  Частина ${idx + 1}: ${chunk.length} точок`);
            });

            return chunks;
        }




        function showChunksModal() {
            const list = document.getElementById('chunks-list');

            list.innerHTML = '';

            let totalDist = 0;
            let totalTime = 0;

            routeChunks.forEach((chunk, i) => {
                const stats = chunkStats[i];

                if (!stats.error) {
                    totalDist += stats.distance;
                    totalTime += stats.time;
                }

                const km = (stats.distance / 1000).toFixed(1);
                const mins = Math.round(stats.time / 60);

                const startPoint = chunk[0].label.split(',')[0];
                const endPoint = chunk[chunk.length - 1].label.split(',')[0];

                const div = document.createElement('div');
                div.className = 'chunk-item';
                div.innerHTML = `
                    <div class="chunk-info">
                        <div class="chunk-title">Частина ${i + 1} з ${routeChunks.length}</div>
                        <div class="chunk-details">📍 ${chunk.length} точок | 🚗 ${km} км | ⏱️ ${mins} хв</div>
                        <div class="chunk-details" style="font-size: 11px; color: #999; margin-top: 3px;">${startPoint.substring(0, 25)}... → ${endPoint.substring(0, 25)}...</div>
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
            const start = chunk[0].coords;
            const end = chunk[chunk.length - 1].coords;

            let url = `https://mapy.com/fnc/v1/route`;
            url += `?start=${start.x},${start.y}`;
            url += `&end=${end.x},${end.y}`;

            if (chunk.length > 2) {
                const waypoints = chunk.slice(1, -1)
                                      .map(p => `${p.coords.x},${p.coords.y}`)
                                      .join(';');
                url += `&waypoints=${waypoints}`;
            }

            url += `&routeType=car_fast_traffic`;
            url += `&navigate=true`;

            console.log(`=== ЗАПУСК ЧАСТИНИ ${index + 1} ===`);
            console.log(`URL: ${url}`);

            window.open(url, `_blank`);

            chunkStats[index].launched = true;
            const btn = document.getElementById(`chunk-btn-${index}`);
            btn.textContent = '✓ Запущено';
            btn.classList.add('launched');

            if (navigator.vibrate) navigator.vibrate(50);
        }




        function launchAllChunks() {
            for (let i = 0; i < routeChunks.length; i++) {
                setTimeout(() => {
                    launchChunk(i);
                }, i * 1500);
            }
        }




        function launchSingleRoute(routePoints) {
            const coords = routePoints.map(p => p.coords);

            SMap.Route.route(coords, { geometry: true, criterion: 'fast' }).then(route => {
                const results = route.getResults();

                const start = routePoints[0].coords;
                const end = routePoints[routePoints.length - 1].coords;

                let url = `https://mapy.com/fnc/v1/route`;
                url += `?start=${start.x},${start.y}`;
                url += `&end=${end.x},${end.y}`;

                if (routePoints.length > 2) {
                    const waypoints = routePoints.slice(1, -1)
                                          .map(p => `${p.coords.x},${p.coords.y}`)
                                          .join(';');
                    url += `&waypoints=${waypoints}`;
                }

                url += `&routeType=car_fast_traffic`;
                url += `&navigate=true`;

                console.log('=== ЗАПУСК МАРШРУТУ ===');
                console.log(`Точок: ${routePoints.length}`);
                console.log(`URL: ${url}`);

                window.open(url, '_blank');

                const distance = (results.length / 1000).toFixed(1);
                const time = Math.round(results.time / 60);

                alert(`✅ Навігація запущена!\n\n🚗 Дистанція: ${distance} км\n⏱️ Час: ${time} хв\n📍 Точок: ${routePoints.length}`);
            });
        }




        Loader.load(null, { POI: true, suggest: true }, init);