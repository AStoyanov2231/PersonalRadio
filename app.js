// RadioWave PWA - Main Application
class RadioWaveApp {
    constructor() {
        this.currentStation = null;
        this.audioElement = document.getElementById('audioElement');
        this.isPlaying = false;
        this.favorites = JSON.parse(localStorage.getItem('radiowave_favorites') || '[]');
        this.myMusic = JSON.parse(localStorage.getItem('radiowave_music') || '[]');
        // Load volume from localStorage, default to 50 if not found
        this.volume = parseInt(localStorage.getItem('radiowave_volume') || '50', 10);
        this.stations = [];
        this.currentFilter = 'all';
        this.searchQuery = '';
        this.isLandscape = false;
        this.landscapeTimeout = null;
        this.currentMusic = null;
        this.systemVolumeSupported = false;
        
        // Radio Browser API servers - multiple for fallbacks
        this.apiServers = [
            'https://de1.api.radio-browser.info',
            'https://at1.api.radio-browser.info',
            'https://nl1.api.radio-browser.info',
            'https://fr1.api.radio-browser.info'
        ];
        this.apiBase = this.apiServers[0]; // Default to first server
        this.apiRetryCount = 0;
        
        this.audioContext = null;
        this.debounceTimer = null;
        
        this.init();
    }

    async init() {
        console.log('Initializing RadioWave App');
        
        this.setupEventListeners();
        this.setupOrientationHandling();
        this.setupServiceWorker();
        await this.loadStations();
        this.renderFavorites();
        this.renderMyMusic();
        // Set initial volume based on loaded value
        this.setVolume(this.volume);
        this.updatePlayerState();
        this.checkOrientation();
        
        // Setup media session for controlling system media
        this.setupMediaSession();
    }

    setupEventListeners() {
        // Navigation
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                this.switchSection(e.currentTarget.dataset.section);
            });
        });

        // "All" filter button
        document.querySelector('.filter-btn[data-filter="all"]').addEventListener('click', () => {
            this.loadStations();
        });

        // Search
        const searchInput = document.getElementById('searchInput');
        searchInput.addEventListener('input', (e) => {
            this.searchQuery = e.target.value;
            this.debounce(() => this.filterStations(), 300);
        });

        // Top player controls
        document.getElementById('topPlayPauseBtn').addEventListener('click', () => {
            this.togglePlayPause();
        });

        document.getElementById('topPrevBtn').addEventListener('click', () => {
            this.playPrevious();
        });

        document.getElementById('topNextBtn').addEventListener('click', () => {
            this.playNext();
        });

        // Landscape extras controls
        document.getElementById('favoriteBtn').addEventListener('click', () => {
            this.toggleFavorite();
        });

        document.getElementById('volumeBtn').addEventListener('click', () => {
            this.toggleVolumeModal();
        });

        // Volume control
        const volumeSlider = document.getElementById('volumeSlider');
        volumeSlider.addEventListener('input', (e) => {
            this.setVolume(e.target.value);
        });

        // Upload functionality
        document.getElementById('uploadBtn').addEventListener('click', () => {
            this.showUploadModal();
        });

        // File upload
        const fileInput = document.getElementById('fileInput');
        const uploadArea = document.getElementById('uploadArea');
        
        uploadArea.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', (e) => this.handleFileUpload(e));

        // Drag and drop
        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.style.borderColor = 'var(--primary-color)';
        });
        
        uploadArea.addEventListener('dragleave', () => {
            uploadArea.style.borderColor = 'var(--border-color)';
        });
        
        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.style.borderColor = 'var(--border-color)';
            this.handleFileUpload(e);
        });

        // Modal close handlers
        document.querySelectorAll('.modal-close').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.target.closest('.modal').classList.remove('show');
            });
        });

        // Close modals when clicking outside
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.classList.remove('show');
                }
            });
        });

        // Audio element events
        this.audioElement.addEventListener('loadstart', () => this.showLoading());
        this.audioElement.addEventListener('canplay', () => this.hideLoading());
        this.audioElement.addEventListener('error', () => this.handleAudioError());
        this.audioElement.addEventListener('ended', () => this.playNext());

        // Landscape player controls
        document.getElementById('landscapePlayPauseBtn').addEventListener('click', () => {
            this.togglePlayPause();
        });

        document.getElementById('landscapePrevBtn').addEventListener('click', () => {
            this.playPrevious();
        });

        document.getElementById('landscapeNextBtn').addEventListener('click', () => {
            this.playNext();
        });

        // Landscape favorite button
        document.getElementById('landscapeFavoriteBtn').addEventListener('click', () => {
            this.toggleFavorite();
        });

        // Landscape volume button
        document.getElementById('landscapeVolumeBtn')?.addEventListener('click', () => {
            this.toggleVolumeModal();
        });

        // Landscape volume slider
        const landscapeVolumeSlider = document.getElementById('landscapeVolumeSlider');
        if (landscapeVolumeSlider) {
            landscapeVolumeSlider.addEventListener('input', (e) => {
                this.setVolume(e.target.value);
            });
        }

        // Landscape navigation
        document.querySelectorAll('.landscape-nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                if (e.currentTarget.dataset.section === 'upload') {
                    this.showUploadModal();
                } else {
                    this.switchSection(e.currentTarget.dataset.section);
                    this.updateLandscapeNav();
                }
            });
        });
    }

    async setupServiceWorker() {
        if ('serviceWorker' in navigator) {
            try {
                // Try relative path first for GitHub Pages compatibility
                const registration = await navigator.serviceWorker.register('./sw.js', { scope: './' });
                console.log('Service Worker registered successfully', registration.scope);
            } catch (error) {
                console.log('Service Worker registration failed:', error);
                // Fallback to absolute path
                try {
                    await navigator.serviceWorker.register('/sw.js');
                    console.log('Service Worker registered with fallback path');
                } catch (fallbackError) {
                    console.log('Service Worker registration completely failed:', fallbackError);
                }
            }
        }
    }

    async loadStations() {
        this.showLoading();
        try {
            // Load popular stations first
            const response = await fetch(`${this.apiBase}/json/stations/topvote/100`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            this.stations = await response.json();
            this.renderStations();
            this.apiRetryCount = 0; // Reset retry count on success
        } catch (error) {
            console.error('Failed to load stations:', error);
            
            // Try next API server if available
            if (this.apiRetryCount < this.apiServers.length - 1) {
                this.apiRetryCount++;
                this.apiBase = this.apiServers[this.apiRetryCount];
                console.log(`Trying alternate API server: ${this.apiBase}`);
                return this.loadStations(); // Retry with new server
            }
            
            // All servers failed
            this.showError('Failed to load radio stations. Please check your connection and try again.');
        }
        this.hideLoading();
    }

    async searchStations(query) {
        if (!query) {
            await this.loadStations();
            return;
        }

        this.showLoading();
        try {
            const response = await fetch(
                `${this.apiBase}/json/stations/search?name=${encodeURIComponent(query)}&limit=50`
            );
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            this.stations = await response.json();
            this.renderStations();
            this.apiRetryCount = 0; // Reset retry count on success
        } catch (error) {
            console.error('Search failed:', error);
            
            // Try next API server if available
            if (this.apiRetryCount < this.apiServers.length - 1) {
                this.apiRetryCount++;
                this.apiBase = this.apiServers[this.apiRetryCount];
                console.log(`Trying alternate API server for search: ${this.apiBase}`);
                return this.searchStations(query); // Retry with new server
            }
            
            this.showError('Search failed. Please try again or check your connection.');
        }
        this.hideLoading();
    }

    async loadStationsByFilter(filter) {
        this.showLoading();
        try {
            let endpoint;
            switch (filter) {
                case 'popular':
                    endpoint = 'topvote/100';
                    break;
                case 'country':
                    // Get stations by user's country (fallback to US)
                    const country = await this.getUserCountry();
                    endpoint = `search?countrycode=${country}&limit=100`;
                    break;
                case 'genre':
                    endpoint = 'search?tag=pop,rock,jazz&limit=100';
                    break;
                default:
                    endpoint = 'topvote/100';
            }
            
            const response = await fetch(`${this.apiBase}/json/stations/${endpoint}`);
            this.stations = await response.json();
            this.renderStations();
        } catch (error) {
            console.error('Failed to load filtered stations:', error);
            await this.loadStations(); // Fallback
        }
        this.hideLoading();
    }

    async getUserCountry() {
        try {
            const response = await fetch('https://ipapi.co/json/');
            const data = await response.json();
            return data.country_code || 'US';
        } catch {
            return 'US';
        }
    }

    renderStations() {
        const grid = document.getElementById('stations-grid');
        if (!this.stations || this.stations.length === 0) {
            grid.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-radio"></i>
                    <h3>No stations found</h3>
                    <p>Try adjusting your search or filter</p>
                </div>
            `;
            return;
        }

        grid.innerHTML = this.stations.map(station => this.createStationCard(station)).join('');
        
        // Add click listeners to station cards
        document.querySelectorAll('.station-card').forEach(card => {
            card.addEventListener('click', (e) => {
                if (!e.target.closest('.station-actions')) {
                    const stationId = card.dataset.stationId;
                    const station = this.stations.find(s => 
                        (s.stationuuid && s.stationuuid === stationId) || 
                        (s.uuid && s.uuid === stationId)
                    );
                    
                    if (station) {
                        this.playStation(station);
                    } else {
                        console.error('Station not found:', stationId);
                    }
                }
            });
        });

        // Add listeners to action buttons
        document.querySelectorAll('.play-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const stationId = btn.closest('.station-card').dataset.stationId;
                const station = this.stations.find(s => 
                    (s.stationuuid && s.stationuuid === stationId) || 
                    (s.uuid && s.uuid === stationId)
                );
                
                if (!station) {
                    console.error('Station not found:', stationId);
                    return;
                }
                
                // Check if this is the current station and toggle play/pause instead of just playing
                if (this.currentStation) {
                    const sameStation = (
                        (station.stationuuid && this.currentStation.stationuuid && 
                         station.stationuuid === this.currentStation.stationuuid) ||
                        (station.uuid && this.currentStation.uuid && 
                         station.uuid === this.currentStation.uuid)
                    );
                    
                    if (sameStation) {
                        this.togglePlayPause();
                        return;
                    }
                }
                
                this.playStation(station);
            });
        });

        document.querySelectorAll('.favorite-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const stationId = btn.closest('.station-card').dataset.stationId;
                const station = this.stations.find(s => 
                    (s.stationuuid && s.stationuuid === stationId) || 
                    (s.uuid && s.uuid === stationId)
                );
                
                if (station) {
                    this.toggleStationFavorite(station);
                } else {
                    console.error('Station not found:', stationId);
                }
            });
        });
    }

    createStationCard(station) {
        // Determine station ID (use stationuuid or uuid)
        const stationId = station.stationuuid || station.uuid;
        
        if (!stationId) {
            console.error('Missing station ID in createStationCard:', station);
        }
        
        // Check if station is in favorites
        const isFavorite = this.favorites.some(fav => 
            (fav.stationuuid && station.stationuuid && fav.stationuuid === station.stationuuid) || 
            (fav.uuid && station.uuid && fav.uuid === station.uuid)
        );
        
        // Check if station is currently playing
        const isActive = this.currentStation && (
            (this.currentStation.stationuuid && station.stationuuid && 
             this.currentStation.stationuuid === station.stationuuid) ||
            (this.currentStation.uuid && station.uuid && 
             this.currentStation.uuid === station.uuid)
        );
        
        return `
            <div class="station-card ${isActive ? 'active' : ''}" data-station-id="${stationId}">
                <div class="station-info">
                    <div class="station-avatar">
                        ${station.favicon ? 
                            `<img src="${station.favicon}" alt="${station.name}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 8px;">` : 
                            '<i class="fas fa-radio"></i>'
                        }
                    </div>
                    <div class="station-details">
                        <h3>${station.name || 'Unknown Station'}</h3>
                    </div>
                </div>
                <div class="station-actions">
                    <button class="play-btn">
                        <i class="fas ${isActive && this.isPlaying ? 'fa-pause' : 'fa-play'}"></i>
                    </button>
                    <button class="favorite-btn ${isFavorite ? 'active' : ''}">
                        <i class="fas fa-heart"></i>
                    </button>
                </div>
            </div>
        `;
    }

    renderFavorites() {
        const grid = document.getElementById('favorites-grid');
        if (this.favorites.length === 0) {
            grid.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-heart"></i>
                    <h3>No favorites yet</h3>
                    <p>Add stations to your favorites to see them here</p>
                </div>
            `;
            return;
        }

        grid.innerHTML = this.favorites.map(station => this.createStationCard(station)).join('');
        this.addStationCardListeners();
    }

    renderMyMusic() {
        const grid = document.getElementById('my-music-grid');
        if (this.myMusic.length === 0) {
            grid.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-music"></i>
                    <h3>No songs uploaded</h3>
                    <p>Upload your music to listen offline</p>
                </div>
            `;
            return;
        }

        grid.innerHTML = this.myMusic.map(song => this.createMusicCard(song)).join('');
        this.addMusicCardListeners();
    }

    createMusicCard(song) {
        const isActive = this.currentStation && this.currentStation.id === song.id;
        
        return `
            <div class="station-card ${isActive ? 'active' : ''}" data-song-id="${song.id}">
                <div class="station-info">
                    <div class="station-avatar">
                        <i class="fas fa-music"></i>
                    </div>
                    <div class="station-details">
                        <h3>${song.name}</h3>
                    </div>
                </div>
                <div class="station-actions">
                    <button class="play-btn">
                        <i class="fas ${isActive && this.isPlaying ? 'fa-pause' : 'fa-play'}"></i>
                    </button>
                    <button class="delete-btn">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `;
    }

    addStationCardListeners() {
        document.querySelectorAll('#favorites-grid .station-card').forEach(card => {
            card.addEventListener('click', (e) => {
                if (!e.target.closest('.station-actions')) {
                    const stationId = card.dataset.stationId;
                    const station = this.favorites.find(s => 
                        (s.stationuuid && s.stationuuid === stationId) || 
                        (s.uuid && s.uuid === stationId)
                    );
                    
                    if (station) {
                        this.playStation(station);
                    } else {
                        console.error('Favorite station not found:', stationId);
                    }
                }
            });
        });

        document.querySelectorAll('#favorites-grid .play-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const stationId = btn.closest('.station-card').dataset.stationId;
                const station = this.favorites.find(s => 
                    (s.stationuuid && s.stationuuid === stationId) || 
                    (s.uuid && s.uuid === stationId)
                );
                
                if (!station) {
                    console.error('Favorite station not found:', stationId);
                    return;
                }
                
                // Check if this is the current station and toggle play/pause instead of just playing
                if (this.currentStation) {
                    const sameStation = (
                        (station.stationuuid && this.currentStation.stationuuid && 
                         station.stationuuid === this.currentStation.stationuuid) ||
                        (station.uuid && this.currentStation.uuid && 
                         station.uuid === this.currentStation.uuid)
                    );
                    
                    if (sameStation) {
                        this.togglePlayPause();
                        return;
                    }
                }
                
                this.playStation(station);
            });
        });
    }

    addMusicCardListeners() {
        document.querySelectorAll('#my-music-grid .station-card').forEach(card => {
            card.addEventListener('click', (e) => {
                if (!e.target.closest('.station-actions')) {
                    const songId = card.dataset.songId;
                    const song = this.myMusic.find(s => s.id === songId);
                    this.playLocalMusic(song);
                }
            });
        });

        document.querySelectorAll('#my-music-grid .play-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const songId = btn.closest('.station-card').dataset.songId;
                const song = this.myMusic.find(s => s.id === songId);
                
                // Check if this is the current song and toggle play/pause instead of just playing
                if (this.currentStation && this.currentStation.id === song.id) {
                    this.togglePlayPause();
                } else {
                this.playLocalMusic(song);
                }
            });
        });

        document.querySelectorAll('#my-music-grid .delete-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const songId = btn.closest('.station-card').dataset.songId;
                this.deleteLocalMusic(songId);
            });
        });
    }

    async playStation(station) {
        console.log('Playing station:', station.name);
        
        // Check if this station is already playing
        if (this.currentStation && this.isPlaying) {
            // Check both uuid and stationuuid fields
            const sameStation = (
                (station.stationuuid && this.currentStation.stationuuid && 
                 station.stationuuid === this.currentStation.stationuuid) ||
                (station.uuid && this.currentStation.uuid && 
                 station.uuid === this.currentStation.uuid)
            );
            
            if (sameStation) {
                // If it's the same station and it's already playing, pause it
                this.togglePlayPause();
                return;
            }
        }
        
        // Show loading indicator
        this.showLoading();
        
        try {
            // Reset audio element
            this.audioElement.pause();
            
            // Clear any previous errors
            this.audioElement.onerror = null;
            
            // Configure audio element
            this.audioElement.crossOrigin = "anonymous"; // Add CORS support
            this.audioElement.src = station.url;
            
            // Add error event listener
            this.audioElement.onerror = (e) => {
                console.error('Audio element error:', e);
                
                // Try alternative URL format if available
                if (station.url_resolved && station.url_resolved !== station.url) {
                    console.log('Trying alternative URL:', station.url_resolved);
                    this.audioElement.src = station.url_resolved;
                    this.audioElement.load();
                    this.audioElement.play().catch(error => {
                        console.error('Error playing alternative URL:', error);
                        this.handleAudioError();
                    });
                    return;
                }
                
                this.handleAudioError();
            };
            
            // Set timeout for stalled connections
            const playbackTimeout = setTimeout(() => {
                if (!this.isPlaying) {
                    console.log('Playback timed out');
                    this.handleAudioError();
                }
            }, 10000); // 10 second timeout
            
            // Make sure both uuid and stationuuid are set if available
            if (station.uuid && !station.stationuuid) {
                station.stationuuid = station.uuid;
            } else if (station.stationuuid && !station.uuid) {
                station.uuid = station.stationuuid;
            }
            
            // Update current station
            this.currentStation = station;
            this.currentStation.type = 'radio'; // Explicitly set type
            this.currentMusic = null;
            
            // Start playing
            const playPromise = this.audioElement.play();
            
            if (playPromise !== undefined) {
                playPromise.then(() => {
                    clearTimeout(playbackTimeout);
                    this.isPlaying = true;
                    this.updatePlayerState();
                    this.updateMediaSession(); // Update media session with current station
                    this.hideLoading();
                    
                    // Track station play - wrapped in try/catch to avoid failure
                    try {
                        // Try both uuid and stationuuid
                        this.countStationClick(station.stationuuid || station.uuid);
                    } catch (clickError) {
                        console.log('Failed to count click:', clickError);
                    }
                }).catch(error => {
                    clearTimeout(playbackTimeout);
                    console.error('Error playing audio:', error);
                    
                    // Try alternative URL if available
                    if (station.url_resolved && station.url_resolved !== station.url) {
                        console.log('Trying alternative URL after play failure:', station.url_resolved);
                        this.audioElement.src = station.url_resolved;
                        return this.audioElement.play().catch(secondError => {
                            console.error('Error playing alternative URL:', secondError);
                            this.handleAudioError();
                        });
                    }
                    
                    this.handleAudioError();
                });
            }
        } catch (error) {
            console.error('Error setting up audio:', error);
            this.handleAudioError();
        }
    }

    async playLocalMusic(song) {
        this.currentStation = { ...song, type: 'local' };
        this.audioElement.src = song.url;
        
        try {
            await this.audioElement.play();
            this.isPlaying = true;
            this.updatePlayerUI();
            this.updateMusicCards();
            this.updateNowPlayingIndicator();
        } catch (error) {
            console.error('Local playback failed:', error);
            this.showError('Failed to play local music file');
        }
    }

    togglePlayPause() {
        // Ensure AudioContext is activated (browsers require user gesture)
        this.activateAudioContext();
        
        if (this.isPlaying) {
            // Currently playing, so pause
            this.audioElement.pause();
            this.isPlaying = false;
        } else {
            // Currently paused, so play
            if (this.audioElement.src) {
                const playPromise = this.audioElement.play();
                
                if (playPromise !== undefined) {
                    playPromise.then(() => {
                        this.isPlaying = true;
                    }).catch(error => {
                        console.error('Error playing audio:', error);
                        this.handleAudioError();
                    });
                }
            } else if (this.currentStation) {
                // Try to reload the current station
                this.playStation(this.currentStation);
                return;
            } else {
                console.log('Nothing to play');
                return;
            }
        }
        
        // Update all UI components
        this.updatePlayerState();
        
        // Update media session state
        this.updateMediaSession();
    }

    activateAudioContext() {
        // Some browsers require user interaction to activate AudioContext
        if (this.audioContext && this.audioContext.state === 'suspended') {
            this.audioContext.resume().then(() => {
                console.log('AudioContext activated');
            }).catch(error => {
                console.warn('Failed to activate AudioContext:', error);
            });
        }
    }

    playNext() {
        const currentList = this.getCurrentPlaylist();
        if (currentList.length === 0) return;

        let currentIndex = -1;
        
        // Check if we have a local music file or radio station
        if (this.currentStation) {
            if (this.currentStation.type === 'local') {
                // For local music files
                currentIndex = currentList.findIndex(item => item.id === this.currentStation.id);
            } else {
                // For radio stations - check both stationuuid and uuid fields
                currentIndex = currentList.findIndex(item => 
                    (item.stationuuid && this.currentStation.stationuuid && 
                     item.stationuuid === this.currentStation.stationuuid) || 
                    (item.uuid && this.currentStation.uuid && 
                     item.uuid === this.currentStation.uuid)
                );
            }
        }
        
        // If current station wasn't found, start from beginning
        if (currentIndex === -1) {
            currentIndex = 0;
        } else {
            // Move to next item
            currentIndex = (currentIndex + 1) % currentList.length;
        }
        
        const nextItem = currentList[currentIndex];
        console.log('Playing next item:', nextItem);

        // Play the next item based on its type
        if (nextItem.type === 'local' || (this.currentStation && this.currentStation.type === 'local')) {
            this.playLocalMusic(nextItem);
        } else {
            this.playStation(nextItem);
        }
    }

    playPrevious() {
        const currentList = this.getCurrentPlaylist();
        if (currentList.length === 0) return;

        let currentIndex = -1;
        
        // Check if we have a local music file or radio station
        if (this.currentStation) {
            if (this.currentStation.type === 'local') {
                // For local music files
                currentIndex = currentList.findIndex(item => item.id === this.currentStation.id);
            } else {
                // For radio stations - check both stationuuid and uuid fields
                currentIndex = currentList.findIndex(item => 
                    (item.stationuuid && this.currentStation.stationuuid && 
                     item.stationuuid === this.currentStation.stationuuid) || 
                    (item.uuid && this.currentStation.uuid && 
                     item.uuid === this.currentStation.uuid)
                );
            }
        }
        
        // If current station wasn't found, start from end
        if (currentIndex === -1) {
            currentIndex = currentList.length - 1;
        } else {
            // Move to previous item
            currentIndex = currentIndex === 0 ? currentList.length - 1 : currentIndex - 1;
        }
        
        const prevItem = currentList[currentIndex];
        console.log('Playing previous item:', prevItem);

        // Play the previous item based on its type
        if (prevItem.type === 'local' || (this.currentStation && this.currentStation.type === 'local')) {
            this.playLocalMusic(prevItem);
        } else {
            this.playStation(prevItem);
        }
    }

    getCurrentPlaylist() {
        const activeSection = document.querySelector('.content-section.active').id;
        
        switch (activeSection) {
            case 'radio-section':
                return this.stations;
            case 'favorites-section':
                return this.favorites;
            case 'my-stations-section':
                return this.myMusic;
            default:
                return [];
        }
    }

    toggleFavorite() {
        if (!this.currentStation) return;
        
        // If the current station doesn't have a type, assume it's a radio station
        if (!this.currentStation.type) {
            this.currentStation.type = 'radio';
        }
        
        if (this.currentStation.type !== 'radio') return;
        
        this.toggleStationFavorite(this.currentStation);
    }

    toggleStationFavorite(station) {
        // Determine station ID (use stationuuid or uuid)
        const stationId = station.stationuuid || station.uuid;
        
        if (!stationId) {
            console.error('No station ID found for favoriting');
            return;
        }
        
        // Ensure the station has both uuid and stationuuid set for consistency
        if (station.uuid && !station.stationuuid) {
            station.stationuuid = station.uuid;
        } else if (station.stationuuid && !station.uuid) {
            station.uuid = station.stationuuid;
        }
        
        // Find if station is already a favorite
        const index = this.favorites.findIndex(fav => 
            (fav.stationuuid && fav.stationuuid === stationId) || 
            (fav.uuid && fav.uuid === stationId)
        );
        
        if (index === -1) {
            // Not a favorite yet, add it
            // Make sure station has type property set
            if (!station.type) {
                station.type = 'radio';
            }
            this.favorites.push(station);
        } else {
            // Already a favorite, remove it
            this.favorites.splice(index, 1);
        }
        
        // Save to localStorage
        localStorage.setItem('radiowave_favorites', JSON.stringify(this.favorites));
        
        // Update UI
        this.updatePlayerUI();
        this.renderStations();
        this.renderFavorites();
    }

    async countStationClick(stationUuid) {
        // Don't block on this operation and make it fail silently
        if (!stationUuid) return;
        
        try {
            const response = await fetch(`${this.apiBase}/json/vote/${stationUuid}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'RadioWave/1.0' // Add user agent to reduce rejections
                }
            });
            
            if (!response.ok) {
                console.log(`Failed to count click: ${response.status}`);
                return; // Fail silently, this is non-critical
            }
            
            console.log('Station click counted successfully');
        } catch (error) {
            console.log('Failed to count click:', error);
            // Non-critical, continue without showing error to user
        }
    }

    handleFileUpload(event) {
        const files = event.dataTransfer ? event.dataTransfer.files : event.target.files;
        
        Array.from(files).forEach(file => {
            if (file.type.startsWith('audio/')) {
                this.addLocalMusic(file);
            }
        });
        
        this.hideUploadModal();
    }

    addLocalMusic(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const song = {
                id: Date.now() + Math.random(),
                name: file.name.replace(/\.[^/.]+$/, ""),
                url: e.target.result,
                size: this.formatFileSize(file.size),
                type: 'local'
            };

            this.myMusic.push(song);
            localStorage.setItem('radiowave_music', JSON.stringify(this.myMusic));
            this.renderMyMusic();
        };
        reader.readAsDataURL(file);
    }

    deleteLocalMusic(songId) {
        if (confirm('Delete this song?')) {
            this.myMusic = this.myMusic.filter(song => song.id !== songId);
            localStorage.setItem('radiowave_music', JSON.stringify(this.myMusic));
            this.renderMyMusic();
            
            // Stop playing if this song is currently playing
            if (this.currentStation && this.currentStation.id === songId) {
                this.audioElement.pause();
                this.currentStation = null;
                this.isPlaying = false;
                this.updatePlayerUI();
            }
        }
    }

    switchSection(sectionName) {
        // Update navigation
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
        });
        
        // Update navigation menu
        document.querySelector(`.bottom-nav [data-section="${sectionName}"]`)?.classList.add('active');

        // Update content sections
        document.querySelectorAll('.content-section').forEach(section => {
            section.classList.remove('active');
        });
        document.getElementById(`${sectionName}-section`).classList.add('active');

        // Also update landscape navigation if in landscape mode
        if (this.isLandscape) {
            this.updateLandscapeNav();
        }
    }

    filterStations() {
        if (this.searchQuery) {
            this.searchStations(this.searchQuery);
        } else {
            this.loadStations();
        }
    }

    updatePlayerUI() {
        const topPlayPauseBtn = document.getElementById('topPlayPauseBtn');
        const favoriteBtn = document.getElementById('favoriteBtn');

        if (this.currentStation) {
            const stationName = document.querySelector('.station-name');
            const stationStatus = document.querySelector('.station-status');
            
            stationName.textContent = this.currentStation.name || 'Unknown';
            stationStatus.textContent = this.currentStation.type === 'radio' 
                ? (this.currentStation.tags || 'Radio').split(',')[0] 
                : 'Local Music';

            topPlayPauseBtn.innerHTML = this.isPlaying 
                ? '<i class="fas fa-pause"></i>' 
                : '<i class="fas fa-play"></i>';

            // Update favorite button
            if (this.currentStation.type === 'radio') {
                const isFavorite = this.favorites.some(fav => fav.stationuuid === this.currentStation.stationuuid);
                favoriteBtn.innerHTML = isFavorite 
                    ? '<i class="fas fa-heart"></i>' 
                    : '<i class="far fa-heart"></i>';
                favoriteBtn.style.display = 'block';
            } else {
                favoriteBtn.style.display = 'none';
            }
        } else {
            document.querySelector('.station-name').textContent = 'Select a station';
            document.querySelector('.station-status').textContent = 'Radio';
            topPlayPauseBtn.innerHTML = '<i class="fas fa-play"></i>';
            favoriteBtn.innerHTML = '<i class="far fa-heart"></i>';
        }

        // Also update landscape UI if in landscape mode
        if (this.isLandscape) {
            this.updateLandscapePlayerUI();
        }
    }

    updateStationCards() {
        document.querySelectorAll('.station-card').forEach(card => {
            const stationId = card.dataset.stationId;
            const playBtn = card.querySelector('.play-btn i');
            
            if (this.currentStation) {
                // Check if this card matches the current station using either uuid or stationuuid
                const isCurrentStation = (
                    (this.currentStation.stationuuid && 
                     this.currentStation.stationuuid === stationId) ||
                    (this.currentStation.uuid && 
                     this.currentStation.uuid === stationId)
                );
                
                if (isCurrentStation) {
                    card.classList.add('active');
                    playBtn.className = this.isPlaying ? 'fas fa-pause' : 'fas fa-play';
                } else {
                    card.classList.remove('active');
                    playBtn.className = 'fas fa-play';
                }
            } else {
                card.classList.remove('active');
                playBtn.className = 'fas fa-play';
            }
        });
    }

    updateMusicCards() {
        document.querySelectorAll('#my-music-grid .station-card').forEach(card => {
            const songId = card.dataset.songId;
            const playBtn = card.querySelector('.play-btn i');
            
            if (this.currentStation && this.currentStation.id === songId) {
                card.classList.add('active');
                playBtn.className = this.isPlaying ? 'fas fa-pause' : 'fas fa-play';
            } else {
                card.classList.remove('active');
                playBtn.className = 'fas fa-play';
            }
        });
    }

    updatePlayerState() {
        this.updatePlayerUI();
        this.updateStationCards();
        this.updateMusicCards();
    }

    setVolume(value) {
        // Ensure value is between 0 and 100
        const volumeValue = Math.max(0, Math.min(100, value));
        
        // For iOS devices, we'll show a hint to use physical buttons the first time
        if (this.isIOS && !this.hasShownVolumeHint) {
            this.showVolumeHint();
            this.hasShownVolumeHint = true;
        }
        
        // Set audio volume (0-1 range)
        this.audioElement.volume = volumeValue / 100;
        
        // Try to set system volume if supported and not iOS
        // (For iOS we'll handle this differently)
        if (this.systemVolumeSupported && !this.isIOS) {
            this.setSystemVolume(volumeValue);
        } else if (this.isIOS && this.volumeChangeCount === undefined) {
            // First time on iOS, initialize counter and show hint
            this.volumeChangeCount = 0;
            this.showVolumeHint();
        } else if (this.isIOS) {
            // Count volume changes on iOS to determine if we should show a hint
            this.volumeChangeCount++;
            
            // Every 3 volume changes, remind iOS users to use physical buttons
            if (this.volumeChangeCount % 3 === 0) {
                this.setSystemVolume(volumeValue);
            }
        }
        
        // Update UI elements
        document.getElementById('volumeValue').textContent = `${volumeValue}%`;
        document.getElementById('volumeSlider').value = volumeValue;
        
        // Update the background to show the filled portion for the modal slider
        const percentage = volumeValue + '%';
        document.getElementById('volumeSlider').style.background = `linear-gradient(to right, var(--primary-color) ${percentage}, var(--card-color) ${percentage})`;
        
        // Update landscape volume slider if it exists
        const landscapeVolumeSlider = document.getElementById('landscapeVolumeSlider');
        const landscapeVolumeValue = document.getElementById('landscapeVolumeValue');
        
        if (landscapeVolumeSlider) {
            landscapeVolumeSlider.value = volumeValue;
            // Update the background to show the filled portion
            landscapeVolumeSlider.style.background = `linear-gradient(to right, var(--primary-color) ${percentage}, var(--card-color) ${percentage})`;
        }
        
        if (landscapeVolumeValue) {
            landscapeVolumeValue.textContent = `${volumeValue}%`;
        }
        
        // Update volume icon
        this.updateVolumeIcon(volumeValue);
        
        // Save to localStorage
        localStorage.setItem('radiowave_volume', volumeValue);
    }
    
    setSystemVolume(volumeValue) {
        if (!this.systemVolumeSupported) return;
        
        try {
            // Use normalized value (0-1)
            const normalizedVolume = volumeValue / 100;
            
            // For iOS Safari, we need to try a different approach
            const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
            if (isIOS) {
                // On iOS, we need to trigger the native volume UI
                // This is a workaround as direct system volume control isn't allowed
                // First mute the audio briefly
                const originalVolume = this.audioElement.volume;
                this.audioElement.volume = 0;
                
                // Small timeout to let the UI update
                setTimeout(() => {
                    // Then restore volume - this often triggers the native volume UI
                    this.audioElement.volume = originalVolume;
                    
                    // Force a user interaction with audio to show volume controls
                    if (this.isPlaying) {
                        this.audioElement.pause();
                        this.audioElement.play().catch(err => console.warn('Auto-play after volume change failed:', err));
                    }
                }, 50);
                
                // Show a message to the user
                this.showVolumeHint();
                
                return true;
            }
            
            // Different approaches to control system volume
            if ('mediaSession' in navigator && navigator.mediaSession.setVolume) {
                navigator.mediaSession.setVolume(normalizedVolume);
                return true;
            } 
            
            // Try Volume Manager API if available (some mobile browsers)
            if (navigator.volumeManager && navigator.volumeManager.setVolume) {
                navigator.volumeManager.setVolume(normalizedVolume);
                return true;
            }
            
            // Last resort: AudioContext gain (works on some browsers but not for system volume)
            if (this.audioContext) {
                try {
                    // Create a gain node if we don't have one
                    if (!this.gainNode) {
                        this.gainNode = this.audioContext.createGain();
                        this.gainNode.connect(this.audioContext.destination);
                    }
                    
                    // Set the gain value
                    this.gainNode.gain.value = normalizedVolume;
                    return true;
                } catch (gainError) {
                    console.warn('Gain node error:', gainError);
                }
            }
            
            return false;
        } catch (error) {
            console.warn('System volume control error:', error);
            return false;
        }
    }

    showVolumeHint() {
        // Create volume hint message if it doesn't exist
        let hint = document.getElementById('volume-hint');
        if (!hint) {
            hint = document.createElement('div');
            hint.id = 'volume-hint';
            hint.style.position = 'fixed';
            hint.style.bottom = '70px';
            hint.style.left = '50%';
            hint.style.transform = 'translateX(-50%)';
            hint.style.backgroundColor = 'rgba(0,0,0,0.8)';
            hint.style.color = 'white';
            hint.style.padding = '10px 15px';
            hint.style.borderRadius = '20px';
            hint.style.fontSize = '14px';
            hint.style.zIndex = '9999';
            hint.style.textAlign = 'center';
            hint.style.transition = 'opacity 0.3s ease';
            hint.style.opacity = '0';
            document.body.appendChild(hint);
        }
        
        // Set appropriate message based on device
        let message = 'Use volume buttons to adjust system volume';
        if (this.isIOS) {
            message = 'Use iPhone volume buttons to change system volume';
            
            // If we've shown this hint many times, give more detailed instructions
            if (this.volumeChangeCount > 6) {
                message = 'iOS restricts apps from changing system volume. Please use your iPhone\'s physical volume buttons.';
            }
        }
        
        // Show the hint with the message
        hint.textContent = message;
        hint.style.opacity = '1';
        
        // Hide the hint after 4 seconds
        setTimeout(() => {
            hint.style.opacity = '0';
            // Remove the element after fade out
            setTimeout(() => {
                if (hint.parentNode) {
                    hint.parentNode.removeChild(hint);
                }
            }, 300);
        }, 4000);
    }

    updateVolumeIcon(value) {
        const iconClass = value === 0 ? 'fa-volume-mute' : 
                         value < 30 ? 'fa-volume-off' : 
                         value < 70 ? 'fa-volume-down' : 
                         'fa-volume-up';
        
        // Update top volume icon if exists
        const volumeIcon = document.getElementById('volumeIcon');
        if (volumeIcon) {
            volumeIcon.className = `fas ${iconClass}`;
        }
        
        // Update landscape volume icon
        const landscapeVolumeIcon = document.getElementById('landscapeVolumeIcon');
        if (landscapeVolumeIcon) {
            landscapeVolumeIcon.className = `fas ${iconClass}`;
        }
    }

    toggleVolumeModal() {
        const modal = document.getElementById('volumeModal');
        modal.classList.toggle('show');
        
        setTimeout(() => {
            if (modal.classList.contains('show')) {
                modal.classList.remove('show');
            }
        }, 3000);
    }

    showUploadModal() {
        document.getElementById('uploadModal').classList.add('show');
    }

    hideUploadModal() {
        document.getElementById('uploadModal').classList.remove('show');
    }

    showLoading() {
        // Loading indicator is handled by CSS
    }

    hideLoading() {
        // Loading indicator is handled by CSS
    }

    showError(message) {
        console.error(message);
        
        // Create a toast notification instead of alert
        const toast = document.createElement('div');
        toast.className = 'error-toast';
        toast.innerHTML = `
            <div class="error-icon"><i class="fas fa-exclamation-circle"></i></div>
            <div class="error-message">${message}</div>
            <button class="error-close">&times;</button>
        `;
        
        // Add to body
        document.body.appendChild(toast);
        
        // Show with animation
        setTimeout(() => {
            toast.classList.add('show');
        }, 10);
        
        // Auto hide after 5 seconds
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => {
                document.body.removeChild(toast);
            }, 300); // Wait for animation to complete
        }, 5000);
        
        // Close button
        toast.querySelector('.error-close').addEventListener('click', () => {
            toast.classList.remove('show');
            setTimeout(() => {
                document.body.removeChild(toast);
            }, 300);
        });
    }

    handleAudioError() {
        this.isPlaying = false;
        this.hideLoading();
        
        // Check if we have a current station to provide more context
        let errorMessage = 'Audio playback error.';
        
        if (this.currentStation) {
            errorMessage += ` The station "${this.currentStation.name}" might be offline or unavailable.`;
            
            // Check if the station URL might have been blocked by CORS
            if (this.currentStation.url && (
                this.currentStation.url.includes('http:') || 
                this.currentStation.url.includes('https://www.radio.net') ||
                this.currentStation.url.includes('https://www.franceinter.fr')
            )) {
                errorMessage += ' Access might be restricted due to security policies.';
            }
            
            // Add retry hint
            errorMessage += ' Try again later or select a different station.';
        } else {
            errorMessage += ' Please select a station to play.';
        }
        
        this.showError(errorMessage);
        this.updatePlayerState();
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    debounce(func, wait) {
        clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(func, wait);
    }

    setupOrientationHandling() {
        // Listen for orientation changes
        window.addEventListener('orientationchange', () => {
            // Delay check to allow for transition
            setTimeout(() => this.checkOrientation(), 200);
        });

        // Listen for resize events (for desktop testing)
        window.addEventListener('resize', () => {
            this.debounce(() => this.checkOrientation(), 100);
        });

        // Listen for screen orientation API if available
        if (screen.orientation) {
            screen.orientation.addEventListener('change', () => {
                setTimeout(() => this.checkOrientation(), 200);
            });
        }
    }

    checkOrientation() {
        const isLandscapeNow = this.isLandscapeMode();
        
        if (isLandscapeNow !== this.isLandscape) {
            this.isLandscape = isLandscapeNow;
            this.handleOrientationChange();
        }
    }

    isLandscapeMode() {
        // Check multiple indicators for landscape mode
        const windowAspect = window.innerWidth / window.innerHeight;
        const orientationAngle = screen.orientation ? screen.orientation.angle : window.orientation;
        const isLandscapeBySize = windowAspect > 1.3 && window.innerHeight <= 600;
        const isLandscapeByOrientation = orientationAngle === 90 || orientationAngle === -90 || orientationAngle === 270;
        
        return isLandscapeBySize || isLandscapeByOrientation;
    }

    handleOrientationChange() {
        console.log('Orientation changed to:', this.isLandscape ? 'Landscape' : 'Portrait');
        
        if (this.isLandscape) {
            this.enterLandscapeMode();
        } else {
            this.exitLandscapeMode();
        }
        
        // Update player UI for new orientation
        setTimeout(() => {
            this.updatePlayerUI();
            this.updateNowPlayingIndicator();
            
            // Force station cards to recalculate their layout
            if (this.isLandscape) {
                const stationsGrid = document.querySelector('.stations-grid');
                if (stationsGrid) {
                    stationsGrid.style.display = 'none';
                    setTimeout(() => {
                        stationsGrid.style.display = 'grid';
                    }, 50);
                }
            }
        }, 300);
    }

    enterLandscapeMode() {
        console.log('Entering car mode (landscape)');
        
        // Show landscape controls panel
        const landscapeControlsPanel = document.getElementById('landscapeControlsPanel');
        if (landscapeControlsPanel) {
            landscapeControlsPanel.style.display = 'flex';
        }
        
        // Hide landscape extras
        const landscapeExtras = document.getElementById('landscapeExtras');
        if (landscapeExtras) {
            landscapeExtras.style.display = 'none';
        }
        
        // Hide now playing indicator
        const nowPlayingIndicator = document.getElementById('landscapeNowPlaying');
        if (nowPlayingIndicator) {
            nowPlayingIndicator.style.display = 'none';
        }
        
        // Add landscape class to body for additional styling if needed
        document.body.classList.add('landscape-mode');
        
        // Update landscape UI
        this.updateLandscapePlayerUI();
        this.updateLandscapeNav();
        
        // Ensure proper scroll position
        const mainContent = document.querySelector('.main-content');
        if (mainContent) {
            mainContent.scrollTop = 0;
        }

        // Set initial volume slider value
        const landscapeVolumeSlider = document.getElementById('landscapeVolumeSlider');
        if (landscapeVolumeSlider) {
            const currentVolume = Math.round(this.audioElement.volume * 100);
            landscapeVolumeSlider.value = currentVolume;
        }
    }

    exitLandscapeMode() {
        console.log('Exiting car mode (portrait)');
        
        // Hide landscape controls panel
        const landscapeControlsPanel = document.getElementById('landscapeControlsPanel');
        if (landscapeControlsPanel) {
            landscapeControlsPanel.style.display = 'none';
        }
        
        // Hide now playing indicator
        const nowPlayingIndicator = document.getElementById('landscapeNowPlaying');
        if (nowPlayingIndicator) {
            nowPlayingIndicator.classList.remove('show');
        }
        
        // Remove landscape class
        document.body.classList.remove('landscape-mode');
    }

    updateNowPlayingIndicator() {
        const nowPlayingIndicator = document.getElementById('landscapeNowPlaying');
        if (!nowPlayingIndicator) return;
        
        if (this.isLandscape && this.currentStation && this.isPlaying) {
            const icon = nowPlayingIndicator.querySelector('i');
            const text = nowPlayingIndicator.querySelector('span');
            
            if (icon && text) {
                icon.className = this.isPlaying ? 'fas fa-play' : 'fas fa-pause';
                text.textContent = this.currentStation.name || 'Now Playing';
            }
            
            nowPlayingIndicator.classList.add('show');
            
            // Auto-hide after 3 seconds
            clearTimeout(this.landscapeTimeout);
            this.landscapeTimeout = setTimeout(() => {
                nowPlayingIndicator.classList.remove('show');
            }, 3000);
        } else {
            nowPlayingIndicator.classList.remove('show');
        }
    }

    updateLandscapePlayerUI() {
        const landscapePlayPauseBtn = document.getElementById('landscapePlayPauseBtn');
        const landscapeFavoriteBtn = document.getElementById('landscapeFavoriteBtn');
        
        if (!landscapePlayPauseBtn || !landscapeFavoriteBtn) return;
        
        if (this.currentStation) {
            const stationName = document.querySelector('.landscape-station-name');
            const stationStatus = document.querySelector('.landscape-station-status');
            
            if (stationName && stationStatus) {
                stationName.textContent = this.currentStation.name || 'Unknown';
                stationStatus.textContent = this.currentStation.type === 'radio' 
                    ? (this.currentStation.tags || 'Radio').split(',')[0] 
                    : 'Local Music';
            }
            
            landscapePlayPauseBtn.innerHTML = this.isPlaying 
                ? '<i class="fas fa-pause"></i>' 
                : '<i class="fas fa-play"></i>';
            
            // Update favorite button
            const favoriteIcon = landscapeFavoriteBtn.querySelector('i');
            const favoriteText = landscapeFavoriteBtn.querySelector('span');
            
            if (this.currentStation.type === 'radio') {
                const isFavorite = this.favorites.some(fav => fav.stationuuid === this.currentStation.stationuuid);
                if (favoriteIcon) {
                    favoriteIcon.className = isFavorite 
                        ? 'fas fa-heart' 
                        : 'far fa-heart';
                }
                if (favoriteText) {
                    favoriteText.textContent = isFavorite ? 'Favorited' : 'Favorite';
                }
                landscapeFavoriteBtn.style.display = 'flex';
            } else {
                landscapeFavoriteBtn.style.display = 'none';
            }
        } else {
            const stationName = document.querySelector('.landscape-station-name');
            const stationStatus = document.querySelector('.landscape-station-status');
            
            if (stationName && stationStatus) {
                stationName.textContent = 'Select a station';
                stationStatus.textContent = 'Radio';
            }
            
            landscapePlayPauseBtn.innerHTML = '<i class="fas fa-play"></i>';
            
            const favoriteIcon = landscapeFavoriteBtn.querySelector('i');
            const favoriteText = landscapeFavoriteBtn.querySelector('span');
            
            if (favoriteIcon) favoriteIcon.className = 'far fa-heart';
            if (favoriteText) favoriteText.textContent = 'Favorite';
        }
    }

    updateLandscapeNav() {
        // Get active section
        const activeSection = document.querySelector('.content-section.active')?.id?.replace('-section', '') || 'radio';
        
        // Update landscape nav
        document.querySelectorAll('.landscape-nav-item').forEach(item => {
            if (item.dataset.section === activeSection) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });
    }

    // Method no longer needed as we only have the "All" button now and search
    setFilter(filter) {
        this.loadStations();
    }

    setupMediaSession() {
        try {
            // Detect iOS
            const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
            this.isIOS = isIOS;
            
            // Initialize AudioContext for potential volume control
            if (!this.audioContext && (window.AudioContext || window.webkitAudioContext)) {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
                
                // Create a connection to the audio element through the AudioContext
                // Skip for iOS since it often causes issues
                if (this.audioElement && this.audioContext && !isIOS) {
                    try {
                        const source = this.audioContext.createMediaElementSource(this.audioElement);
                        source.connect(this.audioContext.destination);
                    } catch (error) {
                        console.warn('Could not connect audio element to context:', error);
                    }
                }
                
                // On iOS, we'll use a different approach for volume, but mark as supported
                if (isIOS) {
                    this.systemVolumeSupported = true;
                    console.log('Using iOS-specific volume control approach');
                }
                // Check if the browser supports system volume control via MediaSession
                else if ('mediaSession' in navigator) {
                    if (navigator.mediaSession.setVolume) {
                        this.systemVolumeSupported = true;
                        console.log('System volume control is supported via MediaSession API');
                    }
                }
                
                // Check for other volume control APIs
                if (navigator.volumeManager && navigator.volumeManager.setVolume) {
                    this.systemVolumeSupported = true;
                    console.log('System volume control is supported via Volume Manager API');
                }
                
                // Setup media session controls - these will work on iOS for playback controls
                // but not for volume control
                if ('mediaSession' in navigator) {
                    navigator.mediaSession.metadata = new MediaMetadata({
                        title: 'RadioWave',
                        artist: 'Tuning...',
                        album: 'RadioWave App',
                        artwork: [
                            { src: '/icons/icon-192x192.png', sizes: '192x192', type: 'image/png' },
                            { src: '/icons/icon-512x512.png', sizes: '512x512', type: 'image/png' }
                        ]
                    });
                    
                    // Set action handlers for media keys
                    navigator.mediaSession.setActionHandler('play', () => this.togglePlayPause());
                    navigator.mediaSession.setActionHandler('pause', () => this.togglePlayPause());
                    navigator.mediaSession.setActionHandler('nexttrack', () => this.playNext());
                    navigator.mediaSession.setActionHandler('previoustrack', () => this.playPrevious());
                }
            }
        } catch (error) {
            console.warn('Media session setup error:', error);
            this.systemVolumeSupported = false;
        }
    }
    
    updateMediaSession() {
        if (!('mediaSession' in navigator)) return;
        
        try {
            // Update media session metadata with current playing info
            const title = this.currentStation ? this.currentStation.name : 
                          this.currentMusic ? this.currentMusic.name : 'RadioWave';
            const artist = this.currentStation ? 'Radio Station' : 
                           this.currentMusic ? this.currentMusic.artist || 'Local Music' : 'Tuning...';
            
            navigator.mediaSession.metadata = new MediaMetadata({
                title: title,
                artist: artist,
                album: 'RadioWave App',
                artwork: [
                    { src: '/icons/icon-192x192.png', sizes: '192x192', type: 'image/png' },
                    { src: '/icons/icon-512x512.png', sizes: '512x512', type: 'image/png' }
                ]
            });
            
            // Update playback state
            navigator.mediaSession.playbackState = this.isPlaying ? 'playing' : 'paused';
        } catch (error) {
            console.warn('Media session update error:', error);
        }
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.radioWaveApp = new RadioWaveApp();
});

// Handle PWA install prompt
let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
    deferredPrompt = e;
    // Could show a custom install button here
});

// Handle app installation
window.addEventListener('appinstalled', () => {
    console.log('RadioWave PWA was installed');
}); 