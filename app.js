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
        
        // Radio Browser API base URL
        this.apiBase = 'https://de1.api.radio-browser.info';
        
        this.init();
    }

    async init() {
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
            this.stations = await response.json();
            this.renderStations();
        } catch (error) {
            console.error('Failed to load stations:', error);
            this.showError('Failed to load radio stations. Please check your connection.');
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
            this.stations = await response.json();
            this.renderStations();
        } catch (error) {
            console.error('Search failed:', error);
            this.showError('Search failed. Please try again.');
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
                    const station = this.stations.find(s => s.stationuuid === stationId);
                    this.playStation(station);
                }
            });
        });

        // Add listeners to action buttons
        document.querySelectorAll('.play-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const stationId = btn.closest('.station-card').dataset.stationId;
                const station = this.stations.find(s => s.stationuuid === stationId);
                
                // Check if this is the current station and toggle play/pause instead of just playing
                if (this.currentStation && this.currentStation.stationuuid === station.stationuuid) {
                    this.togglePlayPause();
                } else {
                    this.playStation(station);
                }
            });
        });

        document.querySelectorAll('.favorite-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const stationId = btn.closest('.station-card').dataset.stationId;
                const station = this.stations.find(s => s.stationuuid === stationId);
                this.toggleStationFavorite(station);
            });
        });
    }

    createStationCard(station) {
        const isFavorite = this.favorites.some(fav => fav.stationuuid === station.stationuuid);
        const isActive = this.currentStation && this.currentStation.stationuuid === station.stationuuid;
        
        return `
            <div class="station-card ${isActive ? 'active' : ''}" data-station-id="${station.stationuuid}">
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
                    const station = this.favorites.find(s => s.stationuuid === stationId);
                    this.playStation(station);
                }
            });
        });

        document.querySelectorAll('#favorites-grid .play-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const stationId = btn.closest('.station-card').dataset.stationId;
                const station = this.favorites.find(s => s.stationuuid === stationId);
                
                // Check if this is the current station and toggle play/pause instead of just playing
                if (this.currentStation && this.currentStation.stationuuid === station.stationuuid) {
                    this.togglePlayPause();
                } else {
                    this.playStation(station);
                }
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
        if (!station || !station.url_resolved) {
            this.showError('Station URL not available');
            return;
        }

        this.currentStation = { ...station, type: 'radio' };
        this.audioElement.src = station.url_resolved;
        
        try {
            await this.audioElement.play();
            this.isPlaying = true;
            this.updatePlayerUI();
            this.updateStationCards();
            this.updateNowPlayingIndicator();
            
            // Count click for the station
            this.countStationClick(station.stationuuid);
        } catch (error) {
            console.error('Playback failed:', error);
            this.showError('Failed to play station. Trying alternative...');
            
            // Try the original URL if resolved fails
            if (station.url !== station.url_resolved) {
                try {
                    this.audioElement.src = station.url;
                    await this.audioElement.play();
                    this.isPlaying = true;
                    this.updatePlayerUI();
                    this.updateStationCards();
                    this.updateNowPlayingIndicator();
                } catch (fallbackError) {
                    this.showError('Station is currently unavailable');
                }
            }
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
        if (!this.currentStation) {
            this.showError('Please select a station or song first');
            return;
        }

        if (this.isPlaying) {
            this.audioElement.pause();
            this.isPlaying = false;
        } else {
            this.audioElement.play().catch(error => {
                console.error('Playback failed:', error);
                this.showError('Playback failed');
            });
            this.isPlaying = true;
        }
        
        this.updatePlayerUI();
        this.updateStationCards();
        this.updateMusicCards();
        this.updateNowPlayingIndicator();
    }

    playNext() {
        const currentList = this.getCurrentPlaylist();
        if (currentList.length === 0) return;

        const currentIndex = currentList.findIndex(item => {
            return this.currentStation.type === 'radio' 
                ? item.stationuuid === this.currentStation.stationuuid
                : item.id === this.currentStation.id;
        });

        const nextIndex = (currentIndex + 1) % currentList.length;
        const nextItem = currentList[nextIndex];

        if (this.currentStation.type === 'radio') {
            this.playStation(nextItem);
        } else {
            this.playLocalMusic(nextItem);
        }
    }

    playPrevious() {
        const currentList = this.getCurrentPlaylist();
        if (currentList.length === 0) return;

        const currentIndex = currentList.findIndex(item => {
            return this.currentStation.type === 'radio' 
                ? item.stationuuid === this.currentStation.stationuuid
                : item.id === this.currentStation.id;
        });

        const prevIndex = currentIndex === 0 ? currentList.length - 1 : currentIndex - 1;
        const prevItem = currentList[prevIndex];

        if (this.currentStation.type === 'radio') {
            this.playStation(prevItem);
        } else {
            this.playLocalMusic(prevItem);
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
        if (!this.currentStation || this.currentStation.type !== 'radio') return;
        this.toggleStationFavorite(this.currentStation);
    }

    toggleStationFavorite(station) {
        const index = this.favorites.findIndex(fav => fav.stationuuid === station.stationuuid);
        
        if (index === -1) {
            this.favorites.push(station);
        } else {
            this.favorites.splice(index, 1);
        }
        
        localStorage.setItem('radiowave_favorites', JSON.stringify(this.favorites));
        this.updatePlayerUI();
        this.renderStations();
        this.renderFavorites();
    }

    async countStationClick(stationUuid) {
        try {
            await fetch(`${this.apiBase}/json/add/1/${stationUuid}`, { method: 'POST' });
        } catch (error) {
            console.log('Failed to count click:', error);
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
            
            if (this.currentStation && this.currentStation.stationuuid === stationId) {
                card.classList.add('active');
                playBtn.className = this.isPlaying ? 'fas fa-pause' : 'fas fa-play';
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
        
        // Set audio volume (0-1 range)
        this.audioElement.volume = volumeValue / 100;
        
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
        // Simple error notification - could be enhanced with a toast system
        console.error(message);
        alert(message); // Temporary - should use a proper notification system
    }

    handleAudioError() {
        this.isPlaying = false;
        this.showError('Audio playback error. The station might be offline.');
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