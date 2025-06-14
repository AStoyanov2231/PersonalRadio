class RadioWaveApp {
    constructor() {
        this.currentStation = null;
        this.audioElement = document.getElementById('audioElement');
        this.isPlaying = false;
        this.favorites = JSON.parse(localStorage.getItem('radiowave_favorites') || '[]');
        this.myMusic = JSON.parse(localStorage.getItem('radiowave_music') || '[]');
        this.volume = parseInt(localStorage.getItem('radiowave_volume') || '50', 10);
        this.stations = [];
        this.currentFilter = 'all';
        this.searchQuery = '';
        this.isLandscape = false;
        this.landscapeTimeout = null;
        this.currentMusic = null;
        this.systemVolumeSupported = false;
        this.isOnline = navigator.onLine;
        
        this.musicFolderHandle = null;
        this.hasFileSystemAccess = false;
        this.musicFolderName = 'RadioWave_Music';
        
        this.apiServers = [
            'https://de1.api.radio-browser.info',
            'https://at1.api.radio-browser.info',
            'https://nl1.api.radio-browser.info',
            'https://fr1.api.radio-browser.info'
        ];
        this.apiBase = this.apiServers[0];
        this.apiRetryCount = 0;
        
        this.audioContext = null;
        this.debounceTimer = null;
        
        this.preloadedStations = new Map();
        this.preloadLimit = 5;
        this.playAttempts = 0;
        this.maxPlayAttempts = 3;
        
        this.preloadAudio = new Audio();
        
        this.init();
    }

    async init() {
        this.setupEventListeners();
        this.setupOrientationHandling();
        this.setupServiceWorker();
        this.setupNetworkDetection();
        
        this.isOnline = navigator.onLine;
        
        const urlParams = new URLSearchParams(window.location.search);
        const sectionParam = urlParams.get('section');
        
        this.renderFavorites();
        this.checkFileSystemAccess();
        this.renderMyMusic();
        
        this.setVolume(this.volume);
        this.updatePlayerState();
        this.checkOrientation();
        
        this.setupMediaSession();
        
        if (sectionParam && ['radio', 'favorites', 'my-music'].includes(sectionParam)) {
            if (!this.isOnline && sectionParam === 'radio') {
                setTimeout(() => {
                    this.switchSection('my-music');
                }, 100);
            } else {
                setTimeout(() => {
                    this.switchSection(sectionParam);
                }, 100);
            }
        }
        else if (!this.isOnline) {
            setTimeout(() => {
                this.switchSection('my-music');
            }, 100);
        } else {
            await this.loadStations();
        }
    }

    setupEventListeners() {
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                const section = e.currentTarget.dataset.section;
                
                if (!this.isOnline && section === 'radio') {
                    this.showError('You are offline. Radio stations are not available.');
                    return;
                }
                
                this.switchSection(section);
            });
        });

        document.querySelector('.filter-btn[data-filter="all"]').addEventListener('click', () => {
            this.loadStations();
        });

        const searchInput = document.getElementById('searchInput');
        searchInput.addEventListener('input', (e) => {
            this.searchQuery = e.target.value;
            this.debounce(() => this.filterStations(), 300);
        });

        document.getElementById('topPlayPauseBtn').addEventListener('click', () => {
            this.togglePlayPause();
        });

        document.getElementById('topPrevBtn').addEventListener('click', () => {
            this.playPrevious();
        });

        document.getElementById('topNextBtn').addEventListener('click', () => {
            this.playNext();
        });

        document.getElementById('favoriteBtn').addEventListener('click', () => {
            this.toggleFavorite();
        });

        document.getElementById('volumeBtn').addEventListener('click', () => {
            this.toggleVolumeModal();
        });

        const volumeSlider = document.getElementById('volumeSlider');
        volumeSlider.addEventListener('input', (e) => {
            this.setVolume(e.target.value);
        });

        document.getElementById('uploadBtn').addEventListener('click', () => {
            this.showUploadModal();
        });

        const fileInput = document.getElementById('fileInput');
        const uploadArea = document.getElementById('uploadArea');
        
        uploadArea.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', (e) => this.handleFileUpload(e));

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

        document.querySelectorAll('.modal-close').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.target.closest('.modal').classList.remove('show');
            });
        });

        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.classList.remove('show');
                }
            });
        });

        this.audioElement.addEventListener('loadstart', () => this.showLoading());
        this.audioElement.addEventListener('canplay', () => this.hideLoading());
        this.audioElement.addEventListener('error', () => this.handleAudioError());
        this.audioElement.addEventListener('ended', () => this.playNext());

        document.getElementById('landscapePlayPauseBtn').addEventListener('click', () => {
            this.togglePlayPause();
        });

        document.getElementById('landscapePrevBtn').addEventListener('click', () => {
            this.playPrevious();
        });

        document.getElementById('landscapeNextBtn').addEventListener('click', () => {
            this.playNext();
        });

        document.getElementById('landscapeFavoriteBtn').addEventListener('click', () => {
            this.toggleFavorite();
        });

        document.getElementById('landscapeVolumeBtn')?.addEventListener('click', () => {
            this.toggleVolumeModal();
        });

        const landscapeVolumeSlider = document.getElementById('landscapeVolumeSlider');
        if (landscapeVolumeSlider) {
            landscapeVolumeSlider.addEventListener('input', (e) => {
                this.setVolume(e.target.value);
            });
        }

        document.querySelectorAll('.landscape-nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                const section = e.currentTarget.dataset.section;
                
                if (section === 'upload') {
                    this.showUploadModal();
                } else {
                    if (!this.isOnline && section === 'radio') {
                        this.showError('You are offline. Radio stations are not available.');
                        return;
                    }
                    
                    this.switchSection(section);
                    this.updateLandscapeNav();
                }
            });
        });
    }

    async setupServiceWorker() {
        if ('serviceWorker' in navigator) {
            try {
                const registration = await navigator.serviceWorker.register('./sw.js', { scope: './' });
                
                registration.addEventListener('updatefound', () => {
                    const newWorker = registration.installing;
                    
                    newWorker.addEventListener('statechange', () => {
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            this.showUpdateAvailableMessage();
                        }
                    });
                });
                
                navigator.serviceWorker.addEventListener('message', (event) => {
                    if (event.data && event.data.type === 'RELOAD_PAGE') {
                        window.location.reload();
                    }
                });
                
                if (registration.waiting) {
                    this.showUpdateAvailableMessage();
                }
            } catch (error) {
                try {
                    await navigator.serviceWorker.register('/sw.js');
                } catch (fallbackError) {
                    console.log('Service Worker registration failed:', fallbackError);
                }
            }
        }
    }
    
    showUpdateAvailableMessage() {
        const updateToast = document.createElement('div');
        updateToast.className = 'update-toast';
        updateToast.innerHTML = `
            <div class="update-message">New version available</div>
            <button class="update-button">Update Now</button>
        `;
        
        document.body.appendChild(updateToast);
        
        setTimeout(() => {
            updateToast.classList.add('show');
        }, 10);
        
        updateToast.querySelector('.update-button').addEventListener('click', () => {
            updateToast.classList.remove('show');
            
            if (navigator.serviceWorker.controller) {
                navigator.serviceWorker.controller.postMessage({ type: 'SKIP_WAITING' });
                
                window.location.reload();
            }
        });
    }

    async loadStations() {
        if (!this.isOnline) {
            document.getElementById('stations-grid').innerHTML = `
                <div class="offline-message">
                    <i class="fas fa-exclamation-triangle"></i>
                    <h3>You're offline</h3>
                    <p>Radio stations are not available without an internet connection.</p>
                    <p>Switch to My Music to listen to your uploaded songs.</p>
                </div>
            `;
            return;
        }
        
        this.showLoading();
        try {
            const response = await fetch(`${this.apiBase}/json/stations/topvote/100`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            this.stations = await response.json();
            this.renderStations();
            this.apiRetryCount = 0;
            
            this.preloadTopStations();
        } catch (error) {
            if (this.apiRetryCount < this.apiServers.length - 1) {
                this.apiRetryCount++;
                this.apiBase = this.apiServers[this.apiRetryCount];
                return this.loadStations();
            }
            
            this.showError('Failed to load radio stations. Please check your connection and try again.');
        }
        this.hideLoading();
    }

    preloadTopStations() {
        this.preloadedStations.clear();
        
        const stationsToPreload = this.stations.slice(0, this.preloadLimit);
        
        stationsToPreload.forEach(station => {
            this.preloadStation(station);
        });
    }
    
    preloadStation(station) {
        if (!station || !station.url) return;
        
        const stationId = station.stationuuid || station.uuid;
        if (!stationId) return;
        
        if (this.preloadedStations.has(stationId)) return;
        
        const preloadInfo = {
            url: station.url,
            urlResolved: station.url_resolved,
            status: 'pending',
            audio: null
        };
        
        this.preloadedStations.set(stationId, preloadInfo);
        
        setTimeout(() => {
            fetch(station.url, { method: 'HEAD', mode: 'no-cors' })
                .then(() => {
                    preloadInfo.status = 'ready';
                })
                .catch(() => {
                    if (station.url_resolved && station.url_resolved !== station.url) {
                        fetch(station.url_resolved, { method: 'HEAD', mode: 'no-cors' })
                            .then(() => {
                                preloadInfo.status = 'ready';
                                preloadInfo.preferResolved = true;
                            })
                            .catch(() => {
                                preloadInfo.status = 'error';
                            });
                    } else {
                        preloadInfo.status = 'error';
                    }
                });
        }, 0);
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
            this.apiRetryCount = 0;
        } catch (error) {
            if (this.apiRetryCount < this.apiServers.length - 1) {
                this.apiRetryCount++;
                this.apiBase = this.apiServers[this.apiRetryCount];
                return this.searchStations(query);
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
            await this.loadStations();
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
        const stationId = station.stationuuid || station.uuid;
        
        const isFavorite = this.favorites.some(fav => 
            (fav.stationuuid && station.stationuuid && fav.stationuuid === station.stationuuid) || 
            (fav.uuid && station.uuid && fav.uuid === station.uuid)
        );
        
        const isActive = this.currentStation && (
            (this.currentStation.stationuuid && station.stationuuid && 
             this.currentStation.stationuuid === station.stationuuid) ||
            (this.currentStation.uuid && station.uuid && 
             this.currentStation.uuid === station.uuid)
        );
        
        const stationImage = station.favicon ? 
            `<img src="${station.favicon}" alt="${station.name}" loading="lazy" onerror="this.onerror=null; this.innerHTML='<i class=\'fas fa-radio\'></i>'" style="width: 100%; height: 100%; object-fit: cover; border-radius: 8px;">` : 
            '<i class="fas fa-radio"></i>';
        
        const stationName = station.name || 'Unknown Station';
        
        return `
            <div class="station-card ${isActive ? 'active' : ''}" data-station-id="${stationId}">
                <div class="station-info">
                    <div class="station-avatar">
                        ${stationImage}
                    </div>
                    <div class="station-details">
                        <h3 title="${stationName}">${stationName}</h3>
                    </div>
                    <div class="station-actions">
                        <button class="play-btn" title="${isActive && this.isPlaying ? 'Pause' : 'Play'}">
                            <i class="fas ${isActive && this.isPlaying ? 'fa-pause' : 'fa-play'}"></i>
                        </button>
                        <button class="favorite-btn ${isFavorite ? 'active' : ''}" title="${isFavorite ? 'Remove from favorites' : 'Add to favorites'}">
                            <i class="fas fa-heart"></i>
                        </button>
                    </div>
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
        
        if (!grid) {
            console.error('My Music grid element not found');
            return;
        }
        
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
        const isActive = this.currentStation && String(this.currentStation.id) === String(song.id);
        
        return `
            <div class="station-card ${isActive ? 'active' : ''}" data-song-id="${String(song.id)}">
                <div class="station-info">
                    <div class="station-avatar">
                        <i class="fas fa-music"></i>
                    </div>
                    <div class="station-details">
                        <h3 title="${song.name}">${song.name}</h3>
                    </div>
                    <div class="station-actions">
                        <button class="play-btn" title="${isActive && this.isPlaying ? 'Pause' : 'Play'}">
                            <i class="fas ${isActive && this.isPlaying ? 'fa-pause' : 'fa-play'}"></i>
                        </button>
                        <button class="delete-btn" title="Delete song">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
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
                    if (song) {
                        this.playLocalMusic(song);
                    } else {
                        console.error('Song not found:', songId);
                    }
                }
            });
        });

        document.querySelectorAll('#my-music-grid .play-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const songId = btn.closest('.station-card').dataset.songId;
                const song = this.myMusic.find(s => s.id === songId);
                
                if (!song) {
                    console.error('Song not found:', songId);
                    return;
                }
                
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
        this.playAttempts = 0;
        
        if (this.currentStation && this.isPlaying) {
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
        
        this.showLoading();
        
        try {
            this.audioElement.pause();
            this.audioElement.removeAttribute('src');
            this.audioElement.load();
            
            this.audioElement.onerror = null;
            
            const stationId = station.uuid || station.stationuuid;
            if (station.uuid && !station.stationuuid) {
                station.stationuuid = station.uuid;
            } else if (station.stationuuid && !station.uuid) {
                station.uuid = station.stationuuid;
            }
            
            this.currentStation = station;
            this.currentStation.type = 'radio';
            this.currentMusic = null;
            
            const preloadInfo = this.preloadedStations.get(stationId);
            
            this.audioElement.crossOrigin = "anonymous";
            this.audioElement.preload = "auto";
            
            const playbackTimeout = setTimeout(() => {
                if (!this.isPlaying) {
                    this.tryAlternativeUrl(station);
                }
            }, 5000);
            
            this.setupAudioErrorHandling(station, playbackTimeout);
            
            let primaryUrl = station.url;
            let fallbackUrl = station.url_resolved;
            
            if (preloadInfo && preloadInfo.status === 'ready' && preloadInfo.preferResolved) {
                primaryUrl = station.url_resolved;
                fallbackUrl = station.url;
            }
            
            this.audioElement.src = primaryUrl;
            this.audioElement.load();
            
            try {
                this.countStationClick(station.stationuuid || station.uuid);
            } catch (clickError) {
                console.log('Failed to count click:', clickError);
            }
            
            const playPromise = this.audioElement.play();
            
            if (playPromise !== undefined) {
                playPromise.then(() => {
                    clearTimeout(playbackTimeout);
                    this.isPlaying = true;
                    this.updatePlayerState();
                    this.updateMediaSession();
                    this.hideLoading();
                    
                    this.preloadNextStation();
                }).catch(error => {
                    clearTimeout(playbackTimeout);
                    this.tryAlternativeUrl(station);
                });
            }
        } catch (error) {
            this.handleAudioError();
        }
    }
    
    setupAudioErrorHandling(station, playbackTimeout) {
        this.audioElement.onerror = (e) => {
            clearTimeout(playbackTimeout);
            this.tryAlternativeUrl(station);
        };
        
        this.audioElement.onstalled = () => {
            if (this.isPlaying) {
                this.audioElement.load();
                this.audioElement.play().catch(error => {
                    console.error('Stall recovery failed:', error);
                });
            } else {
                this.tryAlternativeUrl(station);
            }
        };
    }
    
    tryAlternativeUrl(station) {
        this.playAttempts++;
        
        if (this.playAttempts >= this.maxPlayAttempts) {
            this.handleAudioError();
            return;
        }
        
        if (station.url && station.url_resolved && station.url !== station.url_resolved) {
            const audioTest1 = new Audio();
            const audioTest2 = new Audio();
            
            const timeout = 3000;
            let resolved = false;
            
            Promise.race([
                new Promise((resolve, reject) => {
                    audioTest1.src = station.url;
                    
                    audioTest1.oncanplay = () => resolve({ url: station.url, element: audioTest1 });
                    audioTest1.onerror = () => reject(new Error('First URL failed'));
                    
                    setTimeout(() => reject(new Error('First URL timeout')), timeout);
                    
                    audioTest1.load();
                }),
                
                new Promise((resolve, reject) => {
                    audioTest2.src = station.url_resolved;
                    
                    audioTest2.oncanplay = () => resolve({ url: station.url_resolved, element: audioTest2 });
                    audioTest2.onerror = () => reject(new Error('Second URL failed'));
                    
                    setTimeout(() => reject(new Error('Second URL timeout')), timeout);
                    
                    audioTest2.load();
                })
            ])
            .then(result => {
                if (resolved) return;
                resolved = true;
                
                audioTest1.src = '';
                audioTest2.src = '';
                
                this.audioElement.src = result.url;
                this.audioElement.load();
                return this.audioElement.play();
            })
            .then(() => {
                this.isPlaying = true;
                this.updatePlayerState();
                this.hideLoading();
            })
            .catch(error => {
                if (!resolved) {
                    resolved = true;
                    this.trySequentialUrls(station);
                }
            });
            
            return;
        }
        
        this.trySequentialUrls(station);
    }
    
    trySequentialUrls(station) {
        if (station.url_resolved && station.url_resolved !== this.audioElement.src) {
            this.audioElement.src = station.url_resolved;
            this.audioElement.load();
            this.audioElement.play().catch(error => {
                if (station.url && station.url !== station.url_resolved && station.url !== this.audioElement.src) {
                    this.audioElement.src = station.url;
                    this.audioElement.load();
                    this.audioElement.play().catch(finalError => {
                        this.handleAudioError();
                    });
                } else {
                    this.handleAudioError();
                }
            });
            return;
        }
        
        if (station.url && station.url !== this.audioElement.src) {
            this.audioElement.src = station.url;
            this.audioElement.load();
            this.audioElement.play().catch(error => {
                this.handleAudioError();
            });
            return;
        }
        
        this.handleAudioError();
    }
    
    preloadNextStation() {
        const currentList = this.getCurrentPlaylist();
        if (currentList.length === 0) return;

        let currentIndex = -1;
        
        if (this.currentStation) {
            if (this.currentStation.type === 'radio') {
                currentIndex = currentList.findIndex(item => 
                    (item.stationuuid && this.currentStation.stationuuid && 
                     item.stationuuid === this.currentStation.stationuuid) || 
                    (item.uuid && this.currentStation.uuid && 
                     item.uuid === this.currentStation.uuid)
                );
            }
        }
        
        if (currentIndex === -1) return;
        
        const nextIndex = (currentIndex + 1) % currentList.length;
        const nextStation = currentList[nextIndex];
        
        if (nextStation && nextStation.type !== 'local') {
            this.preloadStation(nextStation);
        }
    }

    async playLocalMusic(song) {
        try {
            const songId = String(song.id);
            
            if (song.savedToFileSystem && song.filePath && this.hasFileSystemAccess) {
                try {
                    const folderHandle = await this.getMusicFolder();
                    if (folderHandle) {
                        const fileName = song.filePath.split('/').pop();
                        try {
                            const fileHandle = await folderHandle.getFileHandle(fileName);
                            const file = await fileHandle.getFile();
                            
                            const url = URL.createObjectURL(file);
                            
                            this.currentStation = { ...song, type: 'local', id: songId };
                            this.audioElement.src = url;
                            
                            this.currentStation.tempUrl = url;
                            
                            await this.audioElement.play();
                            this.isPlaying = true;
                            this.updatePlayerUI();
                            this.updateMusicCards();
                            this.updateNowPlayingIndicator();
                            return;
                        } catch (err) {
                            console.warn('Could not access file from filesystem:', err);
                        }
                    }
                } catch (err) {
                    console.warn('Error accessing music folder:', err);
                }
            }
            
            this.currentStation = { ...song, type: 'local', id: songId };
            this.audioElement.src = song.url;
            
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
        this.activateAudioContext();
        
        if (this.isPlaying) {
            this.audioElement.pause();
            this.isPlaying = false;
        } else {
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
                this.playStation(this.currentStation);
                return;
            } else {
                return;
            }
        }
        
        this.updatePlayerState();
        
        this.updateMediaSession();
    }

    activateAudioContext() {
        if (this.audioContext && this.audioContext.state === 'suspended') {
            this.audioContext.resume().catch(error => {
                console.warn('Failed to activate AudioContext:', error);
            });
        }
    }

    playNext() {
        const currentList = this.getCurrentPlaylist();
        if (currentList.length === 0) return;

        let currentIndex = -1;
        
        if (this.currentStation) {
            if (this.currentStation.type === 'local') {
                currentIndex = currentList.findIndex(item => item.id === this.currentStation.id);
            } else {
                currentIndex = currentList.findIndex(item => 
                    (item.stationuuid && this.currentStation.stationuuid && 
                     item.stationuuid === this.currentStation.stationuuid) || 
                    (item.uuid && this.currentStation.uuid && 
                     item.uuid === this.currentStation.uuid)
                );
            }
        }
        
        if (currentIndex === -1) {
            currentIndex = 0;
        } else {
            currentIndex = (currentIndex + 1) % currentList.length;
        }
        
        const nextItem = currentList[currentIndex];

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
        
        if (this.currentStation) {
            if (this.currentStation.type === 'local') {
                currentIndex = currentList.findIndex(item => item.id === this.currentStation.id);
            } else {
                currentIndex = currentList.findIndex(item => 
                    (item.stationuuid && this.currentStation.stationuuid && 
                     item.stationuuid === this.currentStation.stationuuid) || 
                    (item.uuid && this.currentStation.uuid && 
                     item.uuid === this.currentStation.uuid)
                );
            }
        }
        
        if (currentIndex === -1) {
            currentIndex = currentList.length - 1;
        } else {
            currentIndex = currentIndex === 0 ? currentList.length - 1 : currentIndex - 1;
        }
        
        const prevItem = currentList[currentIndex];

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
        
        if (!this.currentStation.type) {
            this.currentStation.type = 'radio';
        }
        
        if (this.currentStation.type !== 'radio') return;
        
        this.toggleStationFavorite(this.currentStation);
        
        const favoriteBtn = document.getElementById('favoriteBtn');
        const isFavorite = this.favorites.some(fav => 
            (fav.stationuuid && this.currentStation.stationuuid && 
             fav.stationuuid === this.currentStation.stationuuid) || 
            (fav.uuid && this.currentStation.uuid && 
             fav.uuid === this.currentStation.uuid)
        );
        
        if (favoriteBtn) {
            favoriteBtn.innerHTML = isFavorite 
                ? '<i class="fas fa-heart"></i>' 
                : '<i class="far fa-heart"></i>';
        }
        
        const landscapeFavoriteBtn = document.getElementById('landscapeFavoriteBtn');
        if (landscapeFavoriteBtn) {
            const favoriteIcon = landscapeFavoriteBtn.querySelector('i');
            const favoriteText = landscapeFavoriteBtn.querySelector('span');
            
            if (favoriteIcon) {
                favoriteIcon.className = isFavorite 
                    ? 'fas fa-heart' 
                    : 'far fa-heart';
            }
            
            if (favoriteText) {
                favoriteText.textContent = isFavorite ? 'Favorited' : 'Favorite';
            }
        }
    }

    toggleStationFavorite(station) {
        const stationId = station.stationuuid || station.uuid;
        
        if (!stationId) {
            console.error('No station ID found for favoriting');
            return;
        }
        
        if (station.uuid && !station.stationuuid) {
            station.stationuuid = station.uuid;
        } else if (station.stationuuid && !station.uuid) {
            station.uuid = station.stationuuid;
        }
        
        const index = this.favorites.findIndex(fav => 
            (fav.stationuuid && fav.stationuuid === stationId) || 
            (fav.uuid && fav.uuid === stationId)
        );
        
        const favoriteButtons = document.querySelectorAll(`.station-card[data-station-id="${stationId}"] .favorite-btn`);
        
        if (index === -1) {
            if (!station.type) {
                station.type = 'radio';
            }
            this.favorites.push(station);
            
            favoriteButtons.forEach(btn => {
                btn.classList.add('active');
                btn.title = 'Remove from favorites';
            });
        } else {
            this.favorites.splice(index, 1);
            
            favoriteButtons.forEach(btn => {
                btn.classList.remove('active');
                btn.title = 'Add to favorites';
            });
        }
        
        localStorage.setItem('radiowave_favorites', JSON.stringify(this.favorites));
        
        this.updatePlayerUI();
        this.renderStations();
        this.renderFavorites();
    }

    async countStationClick(stationUuid) {
        if (!stationUuid) return;
        
        try {
            const response = await fetch(`${this.apiBase}/json/vote/${stationUuid}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'RadioWave/1.0'
                }
            });
            
            if (!response.ok) {
                return;
            }
        } catch (error) {
            console.log('Failed to count click:', error);
        }
    }

    async checkFileSystemAccess() {
        if ('showDirectoryPicker' in window) {
            this.hasFileSystemAccess = true;
            
            try {
                const musicFolderKey = 'radiowave_music_folder';
                const storedPermission = await navigator.permissions?.query({
                    name: 'persistent-storage'
                });
                
                if (storedPermission?.state === 'granted' && localStorage.getItem(musicFolderKey)) {
                    try {
                        const fileHandleToken = localStorage.getItem(musicFolderKey);
                    } catch (err) {
                        console.log('Could not reuse file handle:', err);
                    }
                }
            } catch (err) {
                console.log('File System Permission check error:', err);
            }
        } else {
            this.hasFileSystemAccess = false;
        }
    }

    async getMusicFolder() {
        if (!this.hasFileSystemAccess) {
            console.log('File System Access API not supported');
            return null;
        }
        
        try {
            if (!this.musicFolderHandle) {
                const dirHandle = await window.showDirectoryPicker({
                    id: 'radioWaveMusicDir',
                    mode: 'readwrite',
                    startIn: 'music'
                });
                
                try {
                    this.musicFolderHandle = await dirHandle.getDirectoryHandle(
                        this.musicFolderName, 
                        { create: true }
                    );
                    
                    console.log('Music folder created/accessed successfully');
                    
                    if (navigator.storage && navigator.storage.persist) {
                        const isPersisted = await navigator.storage.persist();
                        console.log(`Persisted storage permission: ${isPersisted}`);
                    }
                } catch (err) {
                    console.error('Error creating music subfolder:', err);
                    this.musicFolderHandle = dirHandle;
                }
            }
            
            return this.musicFolderHandle;
        } catch (err) {
            console.error('Error accessing music folder:', err);
            return null;
        }
    }

    handleFileUpload(event) {
        const files = event.dataTransfer ? event.dataTransfer.files : event.target.files;
        
        const mp3Files = Array.from(files).filter(file => 
            file.type === 'audio/mp3' || file.name.toLowerCase().endsWith('.mp3')
        );
        
        if (mp3Files.length === 0) {
            this.showError('Only MP3 files are supported');
            this.hideUploadModal();
            return;
        }
        
        mp3Files.forEach(file => {
            this.addLocalMusic(file);
        });
        
        this.hideUploadModal();
    }

    async addLocalMusic(file) {
        try {
            let fileUrl = '';
            let savedToFileSystem = false;
            
            if (this.hasFileSystemAccess) {
                savedToFileSystem = await this.saveFileToMusicFolder(file);
            }
            
            if (!savedToFileSystem) {
                fileUrl = await this.readFileAsDataURL(file);
            } else {
                fileUrl = `filesystem:${this.musicFolderName}/${file.name}`;
            }
            
            const songId = String(Date.now() + Math.random());
            const song = {
                id: songId,
                name: file.name.replace(/\.[^/.]+$/, ""),
                url: fileUrl,
                filePath: savedToFileSystem ? `${this.musicFolderName}/${file.name}` : null,
                savedToFileSystem: savedToFileSystem,
                size: this.formatFileSize(file.size),
                type: 'local'
            };

            this.myMusic.push(song);
            localStorage.setItem('radiowave_music', JSON.stringify(this.myMusic));
            this.renderMyMusic();
            
            this.showSuccessToast(`Added "${song.name}" to My Music`);
        } catch (error) {
            console.error('Error adding local music:', error);
            this.showError(`Failed to add "${file.name}": ${error.message}`);
        }
    }
    
    readFileAsDataURL(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = (e) => reject(new Error('Failed to read file'));
            reader.readAsDataURL(file);
        });
    }
    
    async saveFileToMusicFolder(file) {
        try {
            const folderHandle = await this.getMusicFolder();
            if (!folderHandle) return false;
            
            const fileHandle = await folderHandle.getFileHandle(file.name, { create: true });
            
            const writable = await fileHandle.createWritable();
            
            await writable.write(file);
            
            await writable.close();
            
            console.log(`File ${file.name} saved to ${this.musicFolderName} folder`);
            return true;
        } catch (error) {
            console.error('Error saving file to music folder:', error);
            return false;
        }
    }
    
    async deleteLocalMusic(songId) {
        if (confirm('Delete this song?')) {
            songId = String(songId);
            const songIndex = this.myMusic.findIndex(song => String(song.id) === songId);
            
            if (songIndex !== -1) {
                const song = this.myMusic[songIndex];
                
                if (song.savedToFileSystem && song.filePath && this.hasFileSystemAccess) {
                    try {
                        const folderHandle = await this.getMusicFolder();
                        if (folderHandle) {
                            const fileName = song.filePath.split('/').pop();
                            try {
                                await folderHandle.removeEntry(fileName);
                                console.log(`File ${fileName} deleted from file system`);
                            } catch (err) {
                                console.warn('Could not delete file from filesystem:', err);
                            }
                        }
                    } catch (err) {
                        console.warn('Error accessing music folder for deletion:', err);
                    }
                }
                
                if (this.currentStation && String(this.currentStation.id) === songId) {
                    if (this.currentStation.tempUrl) {
                        URL.revokeObjectURL(this.currentStation.tempUrl);
                    }
                    
                    this.audioElement.pause();
                    this.currentStation = null;
                    this.isPlaying = false;
                    this.updatePlayerUI();
                }
                
                this.myMusic.splice(songIndex, 1);
                localStorage.setItem('radiowave_music', JSON.stringify(this.myMusic));
                this.renderMyMusic();
                
                this.showSuccessToast('Song deleted successfully');
            }
        }
    }
    
    showSuccessToast(message) {
        const toast = document.createElement('div');
        toast.className = 'success-toast';
        toast.innerHTML = `
            <div class="success-icon"><i class="fas fa-check-circle"></i></div>
            <div class="success-message">${message}</div>
            <button class="success-close">&times;</button>
        `;
        
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.classList.add('show');
        }, 10);
        
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => {
                document.body.removeChild(toast);
            }, 300);
        }, 3000);
        
        toast.querySelector('.success-close').addEventListener('click', () => {
            toast.classList.remove('show');
            setTimeout(() => {
                document.body.removeChild(toast);
            }, 300);
        });
    }

    switchSection(sectionName) {
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
        });
        
        document.querySelector(`.bottom-nav [data-section="${sectionName}"]`)?.classList.add('active');

        document.querySelectorAll('.content-section').forEach(section => {
            section.classList.remove('active');
        });
        document.getElementById(`${sectionName}-section`).classList.add('active');

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

        if (this.isLandscape) {
            this.updateLandscapePlayerUI();
        }
    }

    updateStationCards() {
        document.querySelectorAll('.station-card').forEach(card => {
            const stationId = card.dataset.stationId;
            const playBtn = card.querySelector('.play-btn i');
            
            if (this.currentStation) {
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
            
            if (this.currentStation && String(this.currentStation.id) === String(songId)) {
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

    showError(message) {
        console.error(message);
        
        const toast = document.createElement('div');
        toast.className = 'error-toast';
        toast.innerHTML = `
            <div class="error-icon"><i class="fas fa-exclamation-circle"></i></div>
            <div class="error-message">${message}</div>
            <button class="error-close">&times;</button>
        `;
        
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.classList.add('show');
        }, 10);
        
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => {
                document.body.removeChild(toast);
            }, 300);
        }, 5000);
        
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
        
        let errorMessage = '';
        
        if (this.currentStation) {
            errorMessage += `"${this.currentStation.name}" might be offline or unavailable.`;
            
            if (this.currentStation.url && (
                this.currentStation.url.includes('http:') || 
                this.currentStation.url.includes('https://www.radio.net') ||
                this.currentStation.url.includes('https://www.franceinter.fr')
            )) {
            }
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
    
    setVolume(value) {
        const volumeValue = Math.max(0, Math.min(100, value));
        
        if (this.isIOS && !this.hasShownVolumeHint) {
            this.showVolumeHint();
            this.hasShownVolumeHint = true;
        }
        
        this.audioElement.volume = volumeValue / 100;
        
        if (this.systemVolumeSupported && !this.isIOS) {
            this.setSystemVolume(volumeValue);
        } else if (this.isIOS && this.volumeChangeCount === undefined) {    
            this.volumeChangeCount = 0;
            this.showVolumeHint();
        } else if (this.isIOS) {
            this.volumeChangeCount++;
            
            if (this.volumeChangeCount % 3 === 0) {
                this.setSystemVolume(volumeValue);
            }
        }
        
        document.getElementById('volumeValue').textContent = `${volumeValue}%`;
        document.getElementById('volumeSlider').value = volumeValue;
        
        const percentage = volumeValue + '%';
        document.getElementById('volumeSlider').style.background = `linear-gradient(to right, var(--primary-color) ${percentage}, var(--card-color) ${percentage})`;
        
        const landscapeVolumeSlider = document.getElementById('landscapeVolumeSlider');
        const landscapeVolumeValue = document.getElementById('landscapeVolumeValue');
        
        if (landscapeVolumeSlider) {
            landscapeVolumeSlider.value = volumeValue;
            landscapeVolumeSlider.style.background = `linear-gradient(to right, var(--primary-color) ${percentage}, var(--card-color) ${percentage})`;
        }
        
        if (landscapeVolumeValue) {
            landscapeVolumeValue.textContent = `${volumeValue}%`;
        }
        
        this.updateVolumeIcon(volumeValue);
        
        localStorage.setItem('radiowave_volume', volumeValue);
    }
    
    setSystemVolume(volumeValue) {
        if (!this.systemVolumeSupported) return;
        
        try {
            const normalizedVolume = volumeValue / 100;
            
            const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
            if (isIOS) {
                const originalVolume = this.audioElement.volume;
                this.audioElement.volume = 0;
                
                setTimeout(() => {
                    this.audioElement.volume = originalVolume;
                    
                    if (this.isPlaying) {
                        this.audioElement.pause();
                        this.audioElement.play().catch(err => console.warn('Auto-play after volume change failed:', err));
                    }
                }, 50);
                
                this.showVolumeHint();
                
                return true;
            }
            
            if ('mediaSession' in navigator && navigator.mediaSession.setVolume) {
                navigator.mediaSession.setVolume(normalizedVolume);
                return true;
            } 
            
            if (navigator.volumeManager && navigator.volumeManager.setVolume) {
                navigator.volumeManager.setVolume(normalizedVolume);
                return true;
            }
            
            if (this.audioContext) {
                try {
                    if (!this.gainNode) {
                        this.gainNode = this.audioContext.createGain();
                        this.gainNode.connect(this.audioContext.destination);
                    }
                    
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
        
        let message = 'Use volume buttons to adjust system volume';
        if (this.isIOS) {
            message = 'Use iPhone volume buttons to change system volume';
            
            if (this.volumeChangeCount > 6) {
                message = 'iOS restricts apps from changing system volume. Please use your iPhone\'s physical volume buttons.';
            }
        }
        
        hint.textContent = message;
        hint.style.opacity = '1';
        
        setTimeout(() => {
            hint.style.opacity = '0';
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
        
        const volumeIcon = document.getElementById('volumeIcon');
        if (volumeIcon) {
            volumeIcon.className = `fas ${iconClass}`;
        }
        
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
    }
    
    hideLoading() {
    }
    
    setupOrientationHandling() {
        window.addEventListener('orientationchange', () => {
            setTimeout(() => this.checkOrientation(), 200);
        });
        
        window.addEventListener('resize', () => {
            this.debounce(() => this.checkOrientation(), 100);
        });
        
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
        
        setTimeout(() => {
            this.updatePlayerUI();
            this.updateNowPlayingIndicator();
            
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
        
        const landscapeControlsPanel = document.getElementById('landscapeControlsPanel');
        if (landscapeControlsPanel) {
            landscapeControlsPanel.style.display = 'flex';
        }
        
        const landscapeExtras = document.getElementById('landscapeExtras');
        if (landscapeExtras) {
            landscapeExtras.style.display = 'none';
        }
        
        const nowPlayingIndicator = document.getElementById('landscapeNowPlaying');
        if (nowPlayingIndicator) {
            nowPlayingIndicator.style.display = 'none';
        }
        
        document.body.classList.add('landscape-mode');
        
        this.updateLandscapePlayerUI();
        this.updateLandscapeNav();
        
        const mainContent = document.querySelector('.main-content');
        if (mainContent) {
            mainContent.scrollTop = 0;
        }
        
        const landscapeVolumeSlider = document.getElementById('landscapeVolumeSlider');
        if (landscapeVolumeSlider) {
            const currentVolume = Math.round(this.audioElement.volume * 100);
            landscapeVolumeSlider.value = currentVolume;
        }
    }
    
    exitLandscapeMode() {
        console.log('Exiting car mode (portrait)');
        
        const landscapeControlsPanel = document.getElementById('landscapeControlsPanel');
        if (landscapeControlsPanel) {
            landscapeControlsPanel.style.display = 'none';
        }
        
        const nowPlayingIndicator = document.getElementById('landscapeNowPlaying');
        if (nowPlayingIndicator) {
            nowPlayingIndicator.classList.remove('show');
        }
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
        const activeSection = document.querySelector('.content-section.active')?.id?.replace('-section', '') || 'radio';
        
        document.querySelectorAll('.landscape-nav-item').forEach(item => {
            if (item.dataset.section === activeSection) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });
    }
    
    setupMediaSession() {
        try {
            const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
            this.isIOS = isIOS;
            
            if (!this.audioContext && (window.AudioContext || window.webkitAudioContext)) {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
                
                if (this.audioElement && this.audioContext && !isIOS) {
                    try {
                        const source = this.audioContext.createMediaElementSource(this.audioElement);
                        source.connect(this.audioContext.destination);
                    } catch (error) {
                        console.warn('Could not connect audio element to context:', error);
                    }
                }
                
                if (isIOS) {
                    this.systemVolumeSupported = true;
                    console.log('Using iOS-specific volume control approach');
                }
                else if ('mediaSession' in navigator) {
                    if (navigator.mediaSession.setVolume) {
                        this.systemVolumeSupported = true;
                        console.log('System volume control is supported via MediaSession API');
                    }
                }
                
                if (navigator.volumeManager && navigator.volumeManager.setVolume) {
                    this.systemVolumeSupported = true;
                    console.log('System volume control is supported via Volume Manager API');
                }
                
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
            
            navigator.mediaSession.playbackState = this.isPlaying ? 'playing' : 'paused';
        } catch (error) {
            console.warn('Media session update error:', error);
        }
    }

    setupNetworkDetection() {
        this.isOnline = navigator.onLine;
        console.log(`App starting ${this.isOnline ? 'online' : 'offline'}`);
        
        window.addEventListener('online', () => {
            console.log('App is now online');
            this.isOnline = true;
            this.showSuccessToast('You are now online. Radio stations available.');
            
            if (document.getElementById('radio-section').classList.contains('active')) {
                this.loadStations();
            }
        });
        
        window.addEventListener('offline', () => {
            console.log('App is now offline');
            this.isOnline = false;
            this.showError('You are offline. Radio stations are not available.');
            
            if (document.getElementById('radio-section').classList.contains('active')) {
                this.switchSection('my-music');
            }
        });
        
        const appContainer = document.querySelector('.app-container');
        const offlineIndicator = document.createElement('div');
        offlineIndicator.className = 'offline-indicator';
        offlineIndicator.innerHTML = '<i class="fas fa-wifi-slash"></i> Offline Mode';
        setTimeout(() => {
            const icon = offlineIndicator.querySelector('i');
            const style = window.getComputedStyle(icon);
            const fontFamily = style.getPropertyValue('font-family');
            if (!fontFamily.includes('Font Awesome') || icon.clientWidth === 0) {
                icon.className = 'fas fa-exclamation-triangle';
            }
        }, 500);
        
        offlineIndicator.style.display = this.isOnline ? 'none' : 'block';
        appContainer.appendChild(offlineIndicator);
        
        window.addEventListener('online', () => {
            offlineIndicator.style.display = 'none';
        });
        
        window.addEventListener('offline', () => {
            offlineIndicator.style.display = 'block';
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.radioWaveApp = new RadioWaveApp();
    
    setTimeout(addInstallButton, 2000);
});

let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    showInstallPromotion();
});

function showInstallPromotion() {
    const installButton = document.getElementById('pwa-install-button');
    if (installButton) {
        installButton.style.display = 'block';
    }
}

function addInstallButton() {
    if (document.getElementById('pwa-install-button')) return;
    
    const installButton = document.createElement('button');
    installButton.id = 'pwa-install-button';
    installButton.className = 'pwa-install-button';
    installButton.innerHTML = '<i class="fas fa-download"></i> Install App';
    
    if (!deferredPrompt) {
        installButton.style.display = 'none';
    }
    
    installButton.addEventListener('click', installPWA);
    
    document.body.appendChild(installButton);
    
    const style = document.createElement('style');
    style.textContent = `
        .pwa-install-button {
            position: fixed;
            bottom: 80px;
            right: 20px;
            background-color: var(--primary-color);
            color: white;
            border: none;
            border-radius: 24px;
            padding: 10px 16px;
            font-size: 14px;
            font-weight: 500;
            box-shadow: 0 4px 8px rgba(0,0,0,0.2);
            z-index: 100;
            display: flex;
            align-items: center;
            cursor: pointer;
        }
        .pwa-install-button i {
            margin-right: 8px;
        }
        @media (max-width: 768px) {
            .pwa-install-button {
                bottom: 80px;
                right: 16px;
            }
        }
    `;
    document.head.appendChild(style);
}

function installPWA() {
    const installButton = document.getElementById('pwa-install-button');
    if (installButton) {
        installButton.style.display = 'none';
    }
    
    if (deferredPrompt) {
        deferredPrompt.prompt();
        
        deferredPrompt.userChoice.then((choiceResult) => {
            if (choiceResult.outcome === 'accepted') {
                console.log('User accepted the install prompt');
                const toast = document.createElement('div');
                toast.className = 'success-toast';
                toast.innerHTML = `
                    <div class="success-icon"><i class="fas fa-check-circle"></i></div>
                    <div class="success-message">App installation started!</div>
                `;
                document.body.appendChild(toast);
                setTimeout(() => toast.classList.add('show'), 10);
                setTimeout(() => {
                    toast.classList.remove('show');
                    setTimeout(() => document.body.removeChild(toast), 300);
                }, 3000);
            } else {
                console.log('User dismissed the install prompt');
            }
            deferredPrompt = null;
        });
    } else {
        window.radioWaveApp.showError('Please use your browser menu to install this app or add to home screen');
    }
}
window.addEventListener('appinstalled', () => {
    console.log('RadioWave PWA was installed');
    const installButton = document.getElementById('pwa-install-button');
    if (installButton) {
        installButton.style.display = 'none';
    }
    window.radioWaveApp.showSuccessToast('App installed successfully!');
});