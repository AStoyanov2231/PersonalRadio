document.addEventListener('DOMContentLoaded', function() {
    // Offline functionality verification
    (function() {
        // Create a small indicator element
        const offlineIndicator = document.createElement('div');
        offlineIndicator.style.position = 'fixed';
        offlineIndicator.style.bottom = '10px';
        offlineIndicator.style.left = '10px';
        offlineIndicator.style.backgroundColor = navigator.onLine ? '#1DB954' : '#ff3b30';
        offlineIndicator.style.color = 'white';
        offlineIndicator.style.padding = '5px 10px';
        offlineIndicator.style.borderRadius = '15px';
        offlineIndicator.style.fontSize = '12px';
        offlineIndicator.style.fontWeight = 'bold';
        offlineIndicator.style.zIndex = '9999';
        offlineIndicator.style.boxShadow = '0 2px 5px rgba(0,0,0,0.2)';
        offlineIndicator.textContent = navigator.onLine ? 'Online' : 'Offline';
        document.body.appendChild(offlineIndicator);
        
        // Update indicator when connection status changes
        window.addEventListener('online', () => {
            offlineIndicator.textContent = 'Online';
            offlineIndicator.style.backgroundColor = '#1DB954';
            
            // When coming back online, check if service worker needs updating
            if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
                navigator.serviceWorker.controller.postMessage({type: 'CHECK_UPDATE'});
            }
        });
        
        window.addEventListener('offline', () => {
            offlineIndicator.textContent = 'Offline';
            offlineIndicator.style.backgroundColor = '#ff3b30';
        });
        
        // Add timestamp to show when the page was last loaded
        const loadTime = new Date().toLocaleTimeString();
        console.log(`Page loaded at: ${loadTime}. PWA Status: ${window.matchMedia('(display-mode: standalone)').matches ? 'Installed' : 'Browser'}`);
        
        // Ping the server to check connection (only if online)
        if (navigator.onLine) {
            fetch('./ping', { 
                method: 'GET', 
                cache: 'no-store',
                // Add a timeout to the fetch request
                signal: AbortSignal.timeout(3000) 
            })
                .then(response => console.log('Server ping successful'))
            .catch(err => {
                console.log('Server ping failed - app running in offline mode');
                // Force the app to recognize it's in offline mode even if the browser thinks it's online
                if (navigator.onLine) {
                    console.log('Browser thinks we are online but server is unreachable');
                    // Simulate an offline event to update the UI
                    window.dispatchEvent(new Event('offline'));
                }
            });
        }
    })();
    
    // Check if stylesheets are loaded
    function checkStylesheets() {
        const cssFiles = [
            'styles/base.css',
            'styles/main.css',
            'styles/filters.css',
            'styles/lists.css',
            'styles/messages.css',
            'styles/navigation.css',
            'styles/player.css',
            'styles/responsive.css',
            'styles/search.css',
            'styles/views.css'
        ];
        
        // Check if any stylesheets failed to load
        let hasMissingStyles = false;
        for (const href of cssFiles) {
            // Check if the stylesheet is in the document
            const found = Array.from(document.styleSheets).some(sheet => {
                if (sheet.href && sheet.href.includes(href)) {
                    return true;
                }
                return false;
            });
            
            if (!found) {
                console.warn(`Stylesheet not loaded: ${href}, attempting to reload`);
                hasMissingStyles = true;
                
                // Create and append a new link element
                const link = document.createElement('link');
                link.rel = 'stylesheet';
                link.href = href;
                document.head.appendChild(link);
            }
        }
        
        if (hasMissingStyles) {
            console.log('Some styles were missing and reloaded.');
        }
    }
    
    // Check stylesheets on load
    checkStylesheets();
    
    // Check online status
    function updateOnlineStatus() {
        const statusText = document.getElementById('statusText');
        const isOnline = navigator.onLine;
        
        if (!isOnline) {
            statusText.textContent = 'You are offline. Using cached content.';
            
            // If we're in the discover view, switch to songs or favorites
            if (currentView === 'discover') {
                if (userSongs.length > 0) {
                switchView('songs');
                } else if (favorites.size > 0) {
                    switchView('favorites');
                } else {
                    // Show a message indicating offline limitations
                    showEmptyMessage('You are offline. Your saved content is available.');
                }
            }
        } else {
            statusText.textContent = 'You are back online.';
            setTimeout(() => {
                if (statusText.textContent === 'You are back online.') {
                    statusText.textContent = 'Select a song to play';
                }
            }, 3000);
            
            // Check if service worker needs updating when coming back online
            if ('serviceWorker' in navigator) {
                navigator.serviceWorker.ready.then(registration => {
                    registration.update();
                });
            }
        }
    }
    
    // Listen for online/offline events
    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);
    
    // Initial check
    updateOnlineStatus();

    const playPauseBtn = document.getElementById('playPauseBtn');
    const playIcon = document.querySelector('.play-icon');
    const pauseIcon = document.querySelector('.pause-icon');
    const statusText = document.getElementById('statusText');
    const currentRadio = document.getElementById('currentRadio');
    const radioDescription = document.getElementById('radioDescription');
    const songList = document.querySelector('.song-list');
    const searchInput = document.getElementById('searchInput');
    const songsBtn = document.querySelector('.nav-btn:nth-child(1)');
    const favoritesBtn = document.querySelector('.nav-btn:nth-child(2)');
    const discoverBtn = document.querySelector('.nav-btn:nth-child(3)');
    const searchBar = document.querySelector('.search-bar');
    const pageTitle = document.querySelector('h1');
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    const uploadSongInput = document.getElementById('uploadSong');
    const uploadBtn = document.getElementById('uploadBtn');
    
    const audio = new Audio();
    audio.crossOrigin = 'anonymous';
    
    let isPlaying = false;
    let currentSong = null;
    let userSongs = [];
    let currentView = 'songs'; // 'songs', 'favorites', or 'discover'
    let discoveredStations = [];
    let availableGenres = [];
    let availableLanguages = [];
    let availableCountries = [];
    let currentGenreFilter = '';
    let currentLanguageFilter = '';
    let currentCountryFilter = '';
    let currentGeoFilter = false;
    let currentSortOrder = 'votes';
    
    // Load favorites from localStorage
    let favorites = new Set(JSON.parse(localStorage.getItem('songFavorites') || '[]'));
    // Also store favorite station data (not just IDs)
    let favoriteStationsData = JSON.parse(localStorage.getItem('favoriteStationsData') || '{}');
    
    // Load user songs from localStorage
    function loadUserSongs() {
        try {
            const songs = JSON.parse(localStorage.getItem('userSongs') || '[]');
            console.log('Loaded songs:', songs);
            
            // Recreate object URLs for songs loaded from localStorage
            songs.forEach(song => {
                if (song.data) {
                    // Create a new audio URL from the stored data
                    song.url = song.data;
                }
            });
            
            return songs;
        } catch (error) {
            console.error('Error loading songs:', error);
            return [];
        }
    }
    
    // Save songs to localStorage
    function saveUserSongs() {
        try {
            localStorage.setItem('userSongs', JSON.stringify(userSongs));
            console.log('Saved songs:', userSongs);
        } catch (error) {
            console.error('Error saving songs:', error);
            // If we hit storage limits, show a warning
            if (error.name === 'QuotaExceededError' || error.code === 22) {
                statusText.textContent = 'Storage full. Delete some songs.';
            }
        }
    }
    
    // Radio Browser API function for discovery tab
    async function getRadioBrowserServers() {
        try {
            const response = await fetch('https://all.api.radio-browser.info/json/servers');
            const servers = await response.json();
            return servers[Math.floor(Math.random() * servers.length)].name;
        } catch (error) {
            console.error('Error getting Radio Browser servers:', error);
            return 'de1.api.radio-browser.info'; // Fallback server
        }
    }
    
    // Get available genres from Radio Browser API
    async function fetchAvailableGenres() {
        try {
            const server = await getRadioBrowserServers();
            const response = await fetch(`https://${server}/json/tags?order=stationcount&reverse=true&limit=30`);
            const genres = await response.json();
            return genres.map(genre => ({
                name: genre.name,
                count: genre.stationcount
            }));
        } catch (error) {
            console.error('Error fetching genres:', error);
            return [];
        }
    }
    
    // Get available languages from Radio Browser API
    async function fetchAvailableLanguages() {
        try {
            const server = await getRadioBrowserServers();
            const response = await fetch(`https://${server}/json/languages?order=stationcount&reverse=true&limit=30`);
            const languages = await response.json();
            return languages.map(language => ({
                name: language.name,
                count: language.stationcount
            }));
        } catch (error) {
            console.error('Error fetching languages:', error);
            return [];
        }
    }
    
    // Get available countries from Radio Browser API
    async function fetchAvailableCountries() {
        try {
            const server = await getRadioBrowserServers();
            const response = await fetch(`https://${server}/json/countries?order=stationcount&reverse=true&limit=30`);
            const countries = await response.json();
            return countries.map(country => ({
                name: country.name,
                code: country.iso_3166_1,
                count: country.stationcount
            }));
        } catch (error) {
            console.error('Error fetching countries:', error);
            return [];
        }
    }
    
    async function searchRadioStations(searchTerm = '') {
        try {
            const server = await getRadioBrowserServers();
            const params = new URLSearchParams({
                limit: 100,
                offset: 0,
                order: currentSortOrder,
                reverse: true,
                hidebroken: true
            });
            
            if (searchTerm) {
                params.append('name', searchTerm);
            }
            
            // Add genre filter if selected
            if (currentGenreFilter) {
                params.append('tag', currentGenreFilter);
                params.append('tagExact', 'true');
            }
            
            // Add language filter if selected
            if (currentLanguageFilter) {
                params.append('language', currentLanguageFilter);
                params.append('languageExact', 'true');
            }
            
            // Add country filter if selected
            if (currentCountryFilter) {
                params.append('countrycode', currentCountryFilter);
            }
            
            // Add geolocation filter if enabled
            if (currentGeoFilter) {
                try {
                    const position = await getCurrentPosition();
                    params.append('latitude', position.coords.latitude);
                    params.append('longitude', position.coords.longitude);
                } catch (error) {
                    console.error('Error getting user location:', error);
                    statusText.textContent = 'Location access denied, showing all stations';
                }
            }
            
            statusText.textContent = 'Searching for stations...';
            const response = await fetch(`https://${server}/json/stations/search?${params}`);
            const stations = await response.json();
            
            return stations.map(station => ({
                id: station.stationuuid,
                name: station.name,
                url: station.url_resolved,
                description: `${station.tags || 'Various'} - ${station.country}`,
                image: station.favicon || 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 24 24\'%3E%3Cpath fill=\'%23fff\' d=\'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 14.5c-2.49 0-4.5-2.01-4.5-4.5S9.51 7.5 12 7.5s4.5 2.01 4.5 4.5-2.01 4.5-4.5 4.5zm0-5.5c-.55 0-1 .45-1 1s.45 1 1 1 1-.45 1-1-.45-1-1-1z\'/%3E%3C/svg%3E'
            }));
        } catch (error) {
            console.error('Error searching radio stations:', error);
            statusText.textContent = 'Error searching stations';
            return [];
        }
    }
    
    // Get user's current position for geolocation filter
    function getCurrentPosition() {
        return new Promise((resolve, reject) => {
            if (!navigator.geolocation) {
                reject(new Error('Geolocation is not supported by your browser'));
                return;
            }
            
            navigator.geolocation.getCurrentPosition(resolve, reject, {
                enableHighAccuracy: true,
                timeout: 5000,
                maximumAge: 0
            });
        });
    }
    
    function saveFavorites() {
        localStorage.setItem('songFavorites', JSON.stringify([...favorites]));
        
        // Also save the complete station data
        const allStations = [...discoveredStations];
        const favoriteStationsWithData = {};
        
        allStations.forEach(station => {
            if (favorites.has(station.id)) {
                favoriteStationsData[station.id] = station;
            }
        });
        
        localStorage.setItem('favoriteStationsData', JSON.stringify(favoriteStationsData));
    }
    
    function toggleFavorite(item, button) {
        const isFavorite = favorites.has(item.id);
        if (isFavorite) {
            favorites.delete(item.id);
            button.textContent = '🤍';
            delete favoriteStationsData[item.id];
        } else {
            favorites.add(item.id);
            button.textContent = '❤️';
            favoriteStationsData[item.id] = item;
        }
        saveFavorites();
        
        if (currentView === 'favorites') {
            renderList(getFavoriteItems());
        }
    }
    
    function getFavoriteItems() {
        // For radio stations
        const allStations = [...discoveredStations];
        
        // Add stations from favoriteStationsData that might not be in current session
        Object.values(favoriteStationsData).forEach(station => {
            if (!allStations.some(s => s.id === station.id)) {
                allStations.push(station);
            }
        });
        
        // Filter out duplicates based on id
        const uniqueStations = Array.from(
            new Map(allStations.map(station => [station.id, station])).values()
        );
        
        // Return only favorites
        return uniqueStations.filter(item => favorites.has(item.id));
    }
    
    async function switchView(view) {
        currentView = view;
        pageTitle.textContent = view === 'songs' ? 'Your Songs' : 
                               (view === 'favorites' ? 'Favorites' : 'Discover');
        searchInput.value = '';
        
        // Set the data-view attribute on the player div
        document.querySelector('.player').setAttribute('data-view', view);
        
        // Update navigation buttons
        [songsBtn, favoritesBtn, discoverBtn].forEach(btn => btn.classList.remove('active'));
        
        // Toggle upload button visibility
        uploadBtn.style.display = view === 'songs' ? 'flex' : 'none';
        
        // Remove any existing filter elements
        const existingFilterButton = document.querySelector('.filter-button');
        if (existingFilterButton) {
            existingFilterButton.remove();
        }
        
        const existingFilterModal = document.querySelector('.filter-modal-overlay');
        if (existingFilterModal) {
            existingFilterModal.remove();
        }
        
        switch(view) {
            case 'songs':
                searchBar.style.display = 'block';
                searchInput.placeholder = 'Search songs...';
                songsBtn.classList.add('active');
                userSongs = loadUserSongs();
                renderList(userSongs);
                
                if (userSongs.length === 0) {
                    showEmptySongsMessage();
                }
                break;
                
            case 'favorites':
                searchBar.style.display = 'none';
                favoritesBtn.classList.add('active');
                const favoriteItems = getFavoriteItems();
                renderList(favoriteItems);
                
                if (favoriteItems.length === 0) {
                    showEmptyMessage('No favorite stations yet. Add some from Discover!');
                }
                break;
                
            case 'discover':
                searchBar.style.display = 'block';
                searchInput.placeholder = 'Search global radio stations...';
                discoverBtn.classList.add('active');
                statusText.textContent = 'Loading popular stations...';
                
                // Reset filters
                currentGenreFilter = '';
                currentLanguageFilter = '';
                currentCountryFilter = '';
                currentGeoFilter = false;
                currentSortOrder = 'votes';
                
                // Add filter button to searchBar
                addFilterButton();
                
                // Create filter modal (but don't show it yet)
                createFilterModal();
                
                // Load popular stations by default
                const stations = await searchRadioStations();
                discoveredStations = stations;
                renderList(stations);
                
                if (stations.length === 0) {
                    showEmptyMessage('No stations found. Try a different search!');
                } else {
                    statusText.textContent = 'Select a station to play';
                }
                break;
        }
    }
    
    // Add the filter button to the search bar
    function addFilterButton() {
        const filterButton = document.createElement('button');
        filterButton.className = 'filter-button';
        filterButton.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
            </svg>
            <span class="filter-indicator ${hasActiveFilters() ? 'active' : ''}"></span>
        `;
        
        // Append the button to the search bar
        searchBar.appendChild(filterButton);
        
        // Add click event to open filter modal
        filterButton.addEventListener('click', openFilterModal);
    }
    
    // Check if any filters are currently active
    function hasActiveFilters() {
        return currentGenreFilter || currentLanguageFilter || currentCountryFilter || currentGeoFilter || currentSortOrder !== 'votes';
    }
    
    // Create the filter modal with all categories
    function createFilterModal() {
        // Remove any existing modals first
        const existingModal = document.querySelector('.filter-modal-overlay');
        if (existingModal) {
            existingModal.remove();
        }
        
        const modalOverlay = document.createElement('div');
        modalOverlay.className = 'filter-modal-overlay';
        
        const modal = document.createElement('div');
        modal.className = 'filter-modal';
        
        modal.innerHTML = `
            <div class="filter-modal-header">
                <h2>Filter Stations</h2>
                <button class="close-modal-btn">&times;</button>
            </div>
            <div class="filter-modal-content">
                <div class="filter-tabs">
                    <div class="filter-tab active" data-tab="genres">Genres</div>
                    <div class="filter-tab" data-tab="countries">Countries</div>
                    <div class="filter-tab" data-tab="languages">Languages</div>
                    <div class="filter-tab" data-tab="more">More Options</div>
                </div>
                
                <div class="tab-content active" id="genres-tab">
                    <div class="filter-chips" id="genreChips">
                        <div class="filter-loading">Loading genres...</div>
                    </div>
                </div>
                
                <div class="tab-content" id="countries-tab">
                    <div class="filter-chips" id="countryChips">
                        <div class="filter-loading">Loading countries...</div>
                    </div>
                </div>
                
                <div class="tab-content" id="languages-tab">
                    <div class="filter-chips" id="languageChips">
                        <div class="filter-loading">Loading languages...</div>
                    </div>
                </div>
                
                <div class="tab-content" id="more-tab">
                    <div class="toggle-container">
                        <div class="toggle-switch">
                            <input type="checkbox" id="geoToggle" ${currentGeoFilter ? 'checked' : ''}>
                            <label for="geoToggle">Find stations near me</label>
                        </div>
                        
                        <h3>Sort By</h3>
                        <div class="sort-options">
                            <div class="sort-option">
                                <input type="radio" id="sortVotes" name="sortOrder" value="votes" ${currentSortOrder === 'votes' ? 'checked' : ''}>
                                <label for="sortVotes">Popular</label>
                            </div>
                            <div class="sort-option">
                                <input type="radio" id="sortClicks" name="sortOrder" value="clickcount" ${currentSortOrder === 'clickcount' ? 'checked' : ''}>
                                <label for="sortClicks">Top Clicks</label>
                            </div>
                            <div class="sort-option">
                                <input type="radio" id="sortTrending" name="sortOrder" value="clicktrend" ${currentSortOrder === 'clicktrend' ? 'checked' : ''}>
                                <label for="sortTrending">Trending</label>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div class="filter-modal-footer">
                <button id="resetFiltersBtn">Reset</button>
                <button id="applyFiltersBtn">Apply Filters</button>
            </div>
        `;
        
        modalOverlay.appendChild(modal);
        document.body.appendChild(modalOverlay);
        
        // Add event listeners for modal controls
        document.querySelector('.close-modal-btn').addEventListener('click', closeFilterModal);
        document.getElementById('resetFiltersBtn').addEventListener('click', resetFilters);
        document.getElementById('applyFiltersBtn').addEventListener('click', applyFilters);
        
        // Set up tab switching
        const tabs = document.querySelectorAll('.filter-tab');
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                // Remove active class from all tabs and tab contents
                document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                
                // Add active class to clicked tab
                tab.classList.add('active');
                
                // Show corresponding tab content
                const tabName = tab.getAttribute('data-tab');
                document.getElementById(`${tabName}-tab`).classList.add('active');
            });
        });
        
        // Load filter options asynchronously
        loadFilterOptions();
        
        // Add click outside modal to close
        modalOverlay.addEventListener('click', function(e) {
            if (e.target === modalOverlay) {
                closeFilterModal();
            }
        });
        
        // Handle sort order changes
        document.querySelectorAll('input[name="sortOrder"]').forEach(radio => {
            radio.addEventListener('change', function() {
                currentSortOrder = this.value;
            });
        });
        
        // Handle geolocation toggle
        document.getElementById('geoToggle').addEventListener('change', function() {
            currentGeoFilter = this.checked;
        });
    }
    
    // Load filter options (genres, countries, languages)
    async function loadFilterOptions() {
        // Load genres if not already loaded
        if (availableGenres.length === 0) {
            availableGenres = await fetchAvailableGenres();
        }
        
        // Load languages if not already loaded
        if (availableLanguages.length === 0) {
            availableLanguages = await fetchAvailableLanguages();
        }
        
        // Load countries if not already loaded
        if (availableCountries.length === 0) {
            availableCountries = await fetchAvailableCountries();
        }
        
        // Update chips for each category
        updateFilterChips('genreChips', availableGenres, currentGenreFilter, (genre) => {
            currentGenreFilter = currentGenreFilter === genre.name ? '' : genre.name;
            updateFilterChips('genreChips', availableGenres, currentGenreFilter);
        });
        
        updateFilterChips('languageChips', availableLanguages, currentLanguageFilter, (language) => {
            currentLanguageFilter = currentLanguageFilter === language.name ? '' : language.name;
            updateFilterChips('languageChips', availableLanguages, currentLanguageFilter);
        });
        
        updateFilterChips('countryChips', availableCountries, currentCountryFilter, (country) => {
            currentCountryFilter = currentCountryFilter === country.code ? '' : country.code;
            updateFilterChips('countryChips', availableCountries, currentCountryFilter);
        });
    }
    
    // Update filter chips for a specific category
    function updateFilterChips(containerId, items, selectedValue, clickHandler) {
        const container = document.getElementById(containerId);
        if (!container) return;
        
        // Clear container
        container.innerHTML = '';
        
        // Get top items (limit to 15 for better usability)
        const topItems = items.slice(0, 15);
        
        // Add chips for each item
        topItems.forEach(item => {
            const chip = document.createElement('div');
            chip.className = 'filter-chip';
            
            // Check if this chip should be selected
            const isSelected = containerId === 'countryChips' 
                ? selectedValue === item.code 
                : selectedValue === item.name;
            
            if (isSelected) {
                chip.classList.add('selected');
            }
            
            // Simplified chip content
            chip.textContent = item.name;
            
            // Add click handler to toggle selection
            chip.addEventListener('click', () => {
                // Remove selected class from all chips in this container
                container.querySelectorAll('.filter-chip').forEach(c => {
                    c.classList.remove('selected');
                });
                
                if (clickHandler) {
                    clickHandler(item);
                }
                
                // Only add selected class if this is a new selection
                if (!isSelected) {
                    chip.classList.add('selected');
                }
            });
            
            container.appendChild(chip);
        });
    }
    
    // Open the filter modal
    function openFilterModal() {
        const modal = document.querySelector('.filter-modal-overlay');
        if (modal) {
            modal.classList.add('open');
            document.body.style.overflow = 'hidden'; // Prevent scrolling of background
        }
    }
    
    // Close the filter modal
    function closeFilterModal() {
        const modal = document.querySelector('.filter-modal-overlay');
        if (modal) {
            modal.classList.remove('open');
            document.body.style.overflow = ''; // Restore scrolling
        }
    }
    
    // Apply selected filters and search for stations
    async function applyFilters() {
        if (currentView !== 'discover') return;
        
        statusText.textContent = 'Applying filters...';
        
        // Close the modal
        closeFilterModal();
        
        // Update filter indicator on button
        const indicator = document.querySelector('.filter-indicator');
        if (indicator) {
            indicator.classList.toggle('active', hasActiveFilters());
        }
        
        // Search with current filters
        const stations = await searchRadioStations(searchInput.value);
        discoveredStations = stations;
        renderList(stations);
        
        if (stations.length === 0) {
            showEmptyMessage('No stations match your filters. Try different criteria!');
        } else {
            statusText.textContent = `Found ${stations.length} stations`;
        }
    }
    
    // Reset all filters
    async function resetFilters() {
        if (currentView !== 'discover') return;
        
        // Reset filter variables
        currentGenreFilter = '';
        currentLanguageFilter = '';
        currentCountryFilter = '';
        currentGeoFilter = false;
        currentSortOrder = 'votes';
        
        // Reset UI elements
        document.getElementById('geoToggle').checked = false;
        document.getElementById('sortVotes').checked = true;
        
        // Update chips to show none selected
        updateFilterChips('genreChips', availableGenres, currentGenreFilter, (genre) => {
            currentGenreFilter = genre.name;
            updateFilterChips('genreChips', availableGenres, currentGenreFilter);
        });
        
        updateFilterChips('languageChips', availableLanguages, currentLanguageFilter, (language) => {
            currentLanguageFilter = language.name;
            updateFilterChips('languageChips', availableLanguages, currentLanguageFilter);
        });
        
        updateFilterChips('countryChips', availableCountries, currentCountryFilter, (country) => {
            currentCountryFilter = country.code;
            updateFilterChips('countryChips', availableCountries, currentCountryFilter);
        });
        
        // Update filter indicator
        const indicator = document.querySelector('.filter-indicator');
        if (indicator) {
            indicator.classList.remove('active');
        }
    }
    
    function showEmptySongsMessage() {
        const emptyMessage = document.createElement('div');
        emptyMessage.className = 'empty-message songs';
        emptyMessage.innerHTML = `
            <p>Upload your favorite songs to listen offline</p>
            <div class="upload-prompt">Upload Songs</div>
        `;
        
        const uploadPrompt = emptyMessage.querySelector('.upload-prompt');
        uploadPrompt.addEventListener('click', () => {
            uploadSongInput.click();
        });
        
        songList.innerHTML = ''; // Clear the list first to avoid duplicates
        songList.appendChild(emptyMessage);
    }
    
    function showEmptyMessage(message) {
        const emptyMessage = document.createElement('div');
        emptyMessage.className = 'empty-message';
        emptyMessage.style.textAlign = 'center';
        emptyMessage.style.padding = '20px';
        emptyMessage.style.color = 'var(--text-secondary)';
        emptyMessage.textContent = message;
        songList.appendChild(emptyMessage);
    }
    
    function formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    }
    
    function renderList(items) {
        songList.innerHTML = '';
        if (!items.length) {
            if (currentView === 'songs') {
                showEmptySongsMessage();
            } else {
                showEmptyMessage(currentView === 'discover' ? 
                    'No stations found. Try a different search!' : 'No items available.');
            }
            return;
        }
        
        items.forEach(item => {
            const element = document.createElement('div');
            element.className = currentView === 'songs' ? 'song-item' : 'radio-station';
            
            if ((currentView === 'songs' && currentSong && item.id === currentSong.id) ||
                (currentView !== 'songs' && currentSong && item.id === currentSong.id)) {
                element.classList.add('active');
            }
            
            if (currentView === 'songs') {
                // Render song
                element.innerHTML = `
                    <div class="song-cover">🎵</div>
                    <div class="song-info">
                        <div class="song-title">${item.name}</div>
                        <div class="song-duration">${item.duration || ''}</div>
                    </div>
                    <button class="favorite-btn">${favorites.has(item.id) ? '❤️' : '🤍'}</button>
                `;
            } else if (currentView === 'discover' || currentView === 'favorites') {
                // Render radio station
                element.innerHTML = `
                    <img src="${item.image}" alt="${item.name}" class="station-image" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=\\'http://www.w3.org/2000/svg\\' viewBox=\\'0 0 24 24\\'%3E%3Cpath fill=\\'%23fff\\' d=\\'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 14.5c-2.49 0-4.5-2.01-4.5-4.5S9.51 7.5 12 7.5s4.5 2.01 4.5 4.5-2.01 4.5-4.5 4.5zm0-5.5c-.55 0-1 .45-1 1s.45 1 1 1 1-.45 1-1-.45-1-1-1z\\'/%3E%3C/svg%3E'">
                    <div class="station-info">
                        <div class="station-name">${item.name}</div>
                    </div>
                    <button class="favorite-btn">${favorites.has(item.id) ? '❤️' : '🤍'}</button>
                `;
            }
            
            element.addEventListener('click', (e) => {
                if (!e.target.classList.contains('favorite-btn')) {
                    selectItem(item);
                }
            });
            
            const favoriteBtn = element.querySelector('.favorite-btn');
            favoriteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleFavorite(item, favoriteBtn);
            });
            
            songList.appendChild(element);
        });
    }
    
    function selectItem(item) {
        currentSong = item;
        
        // Check if it's a song from localStorage or online content
        if (item.data) {
            audio.src = item.data; // Use the data URL directly
        } else {
            audio.src = item.url; // For online content
        }
        
        currentRadio.textContent = item.name;
        radioDescription.textContent = item.description || '';
        
        // Update active state in the list
        document.querySelectorAll('.song-item, .radio-station').forEach(el => {
            el.classList.remove('active');
            
            // Check if either the song title or station name matches
            const nameElement = el.querySelector('.song-title') || el.querySelector('.station-name');
            if (nameElement && nameElement.textContent === item.name) {
                el.classList.add('active');
            }
        });
        
        playMedia();
    }
    
    function handlePlayError(error) {
        console.error('Error playing audio:', error);
        console.log('Failed song details:', currentSong);
        statusText.textContent = 'Error playing this media. Try re-uploading the file.';
        isPlaying = false;
        updatePlayPauseButton();
    }
    
    function updatePlayPauseButton() {
        if (isPlaying) {
            playIcon.classList.add('hidden');
            pauseIcon.classList.remove('hidden');
        } else {
            playIcon.classList.remove('hidden');
            pauseIcon.classList.add('hidden');
        }
    }
    
    function playMedia() {
        isPlaying = true;
        updatePlayPauseButton();
        statusText.textContent = 'Connecting...';
        
        audio.load();
        audio.play().catch(error => {
            handlePlayError(error);
            console.log('Audio source that failed:', audio.src);
        });
    }
    
    function pauseMedia() {
        isPlaying = false;
        updatePlayPauseButton();
        audio.pause();
        statusText.textContent = 'Paused';
    }
    
    // Generate a unique ID for songs
    function generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substring(2);
    }
    
    // Handle file upload
    uploadSongInput.addEventListener('change', function(event) {
        const files = event.target.files;
        if (!files.length) return;
        
        statusText.textContent = 'Processing song...';
        
        // Process each selected file
        Array.from(files).forEach(file => {
            // Create a temporary Audio element to get duration
            const tempAudio = new Audio();
            tempAudio.addEventListener('loadedmetadata', function() {
                const duration = tempAudio.duration;
                
                // Create new song object with a unique ID
                const newSong = {
                    id: generateId(),
                    name: file.name.replace(/\.(mp3|ogg|wav|m4a|flac)$/i, ''),
                    duration: formatTime(duration),
                    rawDuration: duration,
                    dateAdded: new Date().toISOString()
                };
                
                // Convert file to data URL for storage
                const reader = new FileReader();
                reader.onload = function(e) {
                    // Store the data URL directly
                    newSong.data = e.target.result;
                    newSong.url = e.target.result; // Set url to be the same as data for immediate use
                    
                    // Add to songs array
                    userSongs.push(newSong);
                    saveUserSongs();
                    
                    // If we're in the songs view, update the list
                    if (currentView === 'songs') {
                        renderList(userSongs);
                    }
                    
                    statusText.textContent = 'Song added: ' + newSong.name;
                };
                reader.readAsDataURL(file);
            });
            
            // Set up the source for the tempAudio element
            const objectUrl = URL.createObjectURL(file);
            tempAudio.src = objectUrl;
            
            tempAudio.addEventListener('error', function(e) {
                statusText.textContent = 'Error processing file: ' + file.name;
                console.error('Error loading audio file:', file.name, e);
                URL.revokeObjectURL(objectUrl);
            });
        });
        
        // Clear the file input
        uploadSongInput.value = '';
    });
    
    // Add debounce function for search
    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }
    
    // Handle search input with debounce
    const handleSearch = debounce(async (searchTerm) => {
        if (currentView === 'discover') {
            const stations = await searchRadioStations(searchTerm);
            discoveredStations = stations;
            renderList(stations);
        } else if (currentView === 'songs') {
            const filteredSongs = userSongs.filter(song => 
                song.name.toLowerCase().includes(searchTerm)
            );
            renderList(filteredSongs);
        }
    }, 500);
    
    searchInput.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();
        handleSearch(searchTerm);
    });
    
    function selectPrevStation() {
        if (!currentSong) return;
        
        // Get current list based on view
        let currentList = [];
        if (currentView === 'songs') {
            currentList = userSongs;
        } else if (currentView === 'favorites') {
            currentList = getFavoriteItems();
        } else if (currentView === 'discover') {
            currentList = discoveredStations;
        }
        
        if (!currentList.length) return;
        
        // Find current station index
        const currentIndex = currentList.findIndex(r => r.id === currentSong.id);
        if (currentIndex === -1) return;
        
        // Select previous station (wrap around to the end if at the beginning)
        const prevIndex = (currentIndex - 1 + currentList.length) % currentList.length;
        selectItem(currentList[prevIndex]);
    }
    
    function selectNextStation() {
        if (!currentSong) return;
        
        // Get current list based on view
        let currentList = [];
        if (currentView === 'songs') {
            currentList = userSongs;
        } else if (currentView === 'favorites') {
            currentList = getFavoriteItems();
        } else if (currentView === 'discover') {
            currentList = discoveredStations;
        }
        
        if (!currentList.length) return;
        
        // Find current station index
        const currentIndex = currentList.findIndex(r => r.id === currentSong.id);
        if (currentIndex === -1) return;
        
        // Select next station (wrap around to the beginning if at the end)
        const nextIndex = (currentIndex + 1) % currentList.length;
        selectItem(currentList[nextIndex]);
    }
    
    // Add navigation button event listeners
    songsBtn.addEventListener('click', () => switchView('songs'));
    favoritesBtn.addEventListener('click', () => switchView('favorites'));
    discoverBtn.addEventListener('click', () => switchView('discover'));
    prevBtn.addEventListener('click', selectPrevStation);
    nextBtn.addEventListener('click', selectNextStation);
    
    playPauseBtn.addEventListener('click', function() {
        if (!currentSong) {
            statusText.textContent = 'Select a song or station';
            return;
        }
        
        if (isPlaying) {
            pauseMedia();
        } else {
            playMedia();
        }
    });
    
    audio.addEventListener('playing', function() {
        statusText.textContent = 'Playing';
        isPlaying = true;
        updatePlayPauseButton();
    });
    
    audio.addEventListener('pause', function() {
        statusText.textContent = 'Paused';
        isPlaying = false;
        updatePlayPauseButton();
    });
    
    audio.addEventListener('error', function() {
        statusText.textContent = 'Error playing this media';
        isPlaying = false;
        updatePlayPauseButton();
    });
    
    audio.addEventListener('ended', function() {
        // Auto play next song
        selectNextStation();
    });
    
    // Load user songs at startup
    userSongs = loadUserSongs();
    
    // Initialize the app with the songs view
    switchView('songs');

    // Function to diagnose style loading issues (can be triggered from console)
    window.diagnosePWAStyles = function() {
        console.log('Diagnosing PWA style issues...');
        
        // Check if we're in standalone mode (PWA)
        const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
        console.log('Running in standalone/PWA mode:', isStandalone);
        
        // Check if we're online
        const isOnline = navigator.onLine;
        console.log('Online status:', isOnline);
        
        // Check cache status
        if ('caches' in window) {
            caches.keys().then(cacheNames => {
                console.log('Available caches:', cacheNames);
                
                // Check our app cache
                const appCacheName = 'radio-app-v3';
                if (cacheNames.includes(appCacheName)) {
                    console.log(`Found app cache: ${appCacheName}`);
                    
                    // Check cache contents for style files
                    caches.open(appCacheName).then(cache => {
                        cache.keys().then(requests => {
                            const styleRequests = requests.filter(request => 
                                request.url.endsWith('.css')
                            );
                            
                            console.log('Cached style files:');
                            styleRequests.forEach(request => {
                                console.log(' - ' + request.url);
                            });
                            
                            // Check if all expected style files are cached
                            const cssFiles = [
                                'styles/base.css',
                                'styles/main.css',
                                'styles/filters.css',
                                'styles/lists.css',
                                'styles/messages.css',
                                'styles/navigation.css',
                                'styles/player.css',
                                'styles/responsive.css',
                                'styles/search.css',
                                'styles/views.css'
                            ];
                            
                            cssFiles.forEach(file => {
                                const fullUrl = new URL(file, window.location.origin).href;
                                const isCached = styleRequests.some(request => 
                                    request.url === fullUrl
                                );
                                
                                console.log(`${file}: ${isCached ? 'Cached ✓' : 'Not cached ✗'}`);
                            });
                        });
                    });
                } else {
                    console.error(`App cache ${appCacheName} not found`);
                }
            });
        } else {
            console.error('Cache API not supported in this browser');
        }
        
        // Check loaded stylesheets
        console.log('Currently loaded stylesheets:');
        Array.from(document.styleSheets).forEach((sheet, index) => {
            console.log(`${index + 1}. ${sheet.href || 'inline'}`);
        });
        
        return 'Diagnosis running in console...';
    };
}); 