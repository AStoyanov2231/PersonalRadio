document.addEventListener('DOMContentLoaded', function() {
    const playPauseBtn = document.getElementById('playPauseBtn');
    const playIcon = document.querySelector('.play-icon');
    const pauseIcon = document.querySelector('.pause-icon');
    const statusText = document.getElementById('statusText');
    const currentRadio = document.getElementById('currentRadio');
    const radioDescription = document.getElementById('radioDescription');
    const radioList = document.querySelector('.radio-list');
    const searchInput = document.getElementById('searchInput');
    const browseBtn = document.querySelector('.nav-btn:nth-child(1)');
    const favoritesBtn = document.querySelector('.nav-btn:nth-child(2)');
    const discoverBtn = document.querySelector('.nav-btn:nth-child(3)');
    const searchBar = document.querySelector('.search-bar');
    const pageTitle = document.querySelector('h1');
    
    // Debug check if elements are found
    console.log('Radio list element:', radioList);
    
    const audio = new Audio();
    audio.crossOrigin = 'anonymous';
    
    let isPlaying = false;
    let currentRadioConfig = null;
    let allRadios = [];
    let currentView = 'browse'; // 'browse', 'favorites', or 'discover'
    let discoveredStations = [];
    let isSearching = false;
    
    // Load favorites from localStorage
    let favorites = new Set(JSON.parse(localStorage.getItem('radioFavorites') || '[]'));
    
    // Radio Browser API functions
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
    
    async function searchRadioStations(searchTerm = '') {
        try {
            const server = await getRadioBrowserServers();
            const params = new URLSearchParams({
                limit: 100,
                offset: 0,
                order: 'votes',
                reverse: true,
                hidebroken: true
            });
            
            if (searchTerm) {
                params.append('name', searchTerm);
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
    
    function saveFavorites() {
        localStorage.setItem('radioFavorites', JSON.stringify([...favorites]));
    }
    
    function toggleFavorite(radio, button) {
        const isFavorite = favorites.has(radio.id);
        if (isFavorite) {
            favorites.delete(radio.id);
            button.textContent = '🤍';
        } else {
            favorites.add(radio.id);
            button.textContent = '❤️';
        }
        saveFavorites();
        
        if (currentView === 'favorites') {
            renderRadioList(getFavoriteStations());
        }
    }
    
    function getFavoriteStations() {
        const stations = currentView === 'discover' ? discoveredStations : allRadios;
        return stations.filter(radio => favorites.has(radio.id));
    }
    
    async function switchView(view) {
        currentView = view;
        pageTitle.textContent = view.charAt(0).toUpperCase() + view.slice(1);
        searchInput.value = '';
        
        // Update navigation buttons
        [browseBtn, favoritesBtn, discoverBtn].forEach(btn => btn.classList.remove('active'));
        
        switch(view) {
            case 'browse':
                searchBar.style.display = 'block';
                searchInput.placeholder = 'Search local stations...';
                browseBtn.classList.add('active');
                renderRadioList(allRadios);
                break;
                
            case 'favorites':
                searchBar.style.display = 'none';
                favoritesBtn.classList.add('active');
                const favoriteStations = getFavoriteStations();
                renderRadioList(favoriteStations);
                
                if (favoriteStations.length === 0) {
                    showEmptyMessage('No favorite stations yet. Add some from Browse or Discover!');
                }
                break;
                
            case 'discover':
                searchBar.style.display = 'block';
                searchInput.placeholder = 'Search global radio stations...';
                discoverBtn.classList.add('active');
                statusText.textContent = 'Loading popular stations...';
                
                // Load popular stations by default
                const stations = await searchRadioStations();
                discoveredStations = stations;
                renderRadioList(stations);
                
                if (stations.length === 0) {
                    showEmptyMessage('No stations found. Try a different search!');
                } else {
                    statusText.textContent = 'Select a station to play';
                }
                break;
        }
    }
    
    function showEmptyMessage(message) {
        const emptyMessage = document.createElement('div');
        emptyMessage.className = 'empty-message';
        emptyMessage.style.textAlign = 'center';
        emptyMessage.style.padding = '20px';
        emptyMessage.style.color = 'var(--text-secondary)';
        emptyMessage.textContent = message;
        radioList.appendChild(emptyMessage);
    }
    
    function renderRadioList(radios) {
        radioList.innerHTML = '';
        if (!radios.length) {
            showEmptyMessage(currentView === 'discover' ? 'No stations found. Try a different search!' : 'No stations available.');
            return;
        }
        
        radios.forEach(radio => {
            const radioElement = document.createElement('div');
            radioElement.className = 'radio-station';
            if (currentRadioConfig && radio.id === currentRadioConfig.id) {
                radioElement.classList.add('active');
            }
            
            radioElement.innerHTML = `
                <img src="${radio.image}" alt="${radio.name}" class="station-image" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=\\'http://www.w3.org/2000/svg\\' viewBox=\\'0 0 24 24\\'%3E%3Cpath fill=\\'%23fff\\' d=\\'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 14.5c-2.49 0-4.5-2.01-4.5-4.5S9.51 7.5 12 7.5s4.5 2.01 4.5 4.5-2.01 4.5-4.5 4.5zm0-5.5c-.55 0-1 .45-1 1s.45 1 1 1 1-.45 1-1-.45-1-1-1z\\'/%3E%3C/svg%3E'">
                <div class="station-info">
                    <div class="station-name">${radio.name}</div>
                    <div class="station-description">${radio.description}</div>
                </div>
                <button class="favorite-btn">${favorites.has(radio.id) ? '❤️' : '🤍'}</button>
            `;
            
            radioElement.addEventListener('click', (e) => {
                if (!e.target.classList.contains('favorite-btn')) {
                    selectRadio(radio);
                }
            });
            
            const favoriteBtn = radioElement.querySelector('.favorite-btn');
            favoriteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleFavorite(radio, favoriteBtn);
            });
            
            radioList.appendChild(radioElement);
        });
    }
    
    function selectRadio(radio) {
        currentRadioConfig = radio;
        audio.src = radio.url;
        currentRadio.textContent = radio.name;
        radioDescription.textContent = radio.description;
        
        // Update active state in the list
        document.querySelectorAll('.radio-station').forEach(el => {
            el.classList.remove('active');
            if (el.querySelector('.station-name').textContent === radio.name) {
                el.classList.add('active');
            }
        });
        
        playRadio();
    }
    
    function handlePlayError(error) {
        console.error('Error playing audio:', error);
        statusText.textContent = 'Error playing this station';
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
    
    function playRadio() {
        isPlaying = true;
        updatePlayPauseButton();
        statusText.textContent = 'Connecting...';
        
        audio.load();
        audio.play().catch(handlePlayError);
    }
    
    function pauseRadio() {
        isPlaying = false;
        updatePlayPauseButton();
        audio.pause();
        statusText.textContent = 'Paused';
    }
    
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
            if (searchTerm.length >= 2) {
                const stations = await searchRadioStations(searchTerm);
                discoveredStations = stations;
                renderRadioList(stations);
            } else if (searchTerm.length === 0 && !isSearching) {
                const stations = await searchRadioStations();
                discoveredStations = stations;
                renderRadioList(stations);
            }
        } else {
            const filteredRadios = allRadios.filter(radio => 
                radio.name.toLowerCase().includes(searchTerm) ||
                radio.description.toLowerCase().includes(searchTerm)
            );
            renderRadioList(filteredRadios);
        }
    }, 500);
    
    searchInput.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();
        handleSearch(searchTerm);
    });
    
    // Add navigation button event listeners
    browseBtn.addEventListener('click', () => switchView('browse'));
    favoritesBtn.addEventListener('click', () => switchView('favorites'));
    discoverBtn.addEventListener('click', () => switchView('discover'));
    
    playPauseBtn.addEventListener('click', function() {
        if (!currentRadioConfig) {
            statusText.textContent = 'Select a radio station';
            return;
        }
        
        if (isPlaying) {
            pauseRadio();
        } else {
            playRadio();
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
        statusText.textContent = 'Error playing this station';
        isPlaying = false;
        updatePlayPauseButton();
    });
    
    // Load radio stations from JSON
    console.log('Starting to fetch radio stations...');
    fetch('radios.json')
        .then(response => {
            console.log('Got response from radios.json:', response);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            console.log('Parsed JSON data:', data);
            if (!data || !data.radios || !Array.isArray(data.radios)) {
                throw new Error('Invalid JSON format: missing radios array');
            }
            allRadios = data.radios;
            console.log('Number of radio stations loaded:', allRadios.length);
            renderRadioList(allRadios);
            
            // Auto-select default radio if specified
            if (data.defaultRadio) {
                const defaultStation = allRadios.find(radio => radio.id === data.defaultRadio);
                if (defaultStation) {
                    console.log('Auto-selecting default station:', defaultStation.name);
                    selectRadio(defaultStation);
                }
            }
        })
        .catch(error => {
            console.error('Error loading radio stations:', error);
            statusText.textContent = 'Error loading radio stations';
            // Try to display the error message to the user
            const errorElement = document.createElement('div');
            errorElement.className = 'error-message';
            errorElement.style.color = 'red';
            errorElement.style.padding = '16px';
            errorElement.style.textAlign = 'center';
            errorElement.textContent = `Failed to load radio stations: ${error.message}`;
            radioList.appendChild(errorElement);
        });
}); 