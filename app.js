/**
 * VaultDL Frontend - App State Machine & API Communication
 * Manages download flow, progress tracking via SSE, and UI updates
 */

// ─────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────

const BACKEND_URL = window.VAULTDL_BACKEND || 'http://localhost:8000';

const SUPPORTED_URL_PATTERNS = [
    /^https?:\/\/(www\.)?youtube\.com\/watch\?v=/,
    /^https?:\/\/youtu\.be\//,
    /^https?:\/\/(www\.)?youtube\.com\/shorts\//,
    /^https?:\/\/(www\.)?facebook\.com\/.*\/videos\//,
    /^https?:\/\/fb\.watch\//,
    /^https?:\/\/(www\.)?facebook\.com\/watch/,
];

// ─────────────────────────────────────────────────────────────────────────
// State Machine
// ─────────────────────────────────────────────────────────────────────────

const STATE = {
    IDLE: 'idle',
    LOADING: 'loading',
    DOWNLOADING: 'downloading',
    MERGING: 'merging',
    DONE: 'done',
    ERROR: 'error',
};

let currentState = STATE.IDLE;
let currentJobId = null;
let currentType = 'video';
let currentVideoQuality = 'best';
let currentAudioQuality = 'mp3_320';
let eventSource = null;

// ─────────────────────────────────────────────────────────────────────────
// DOM Elements
// ─────────────────────────────────────────────────────────────────────────

const elements = {
    // Cards
    idleCard: document.getElementById('idle-card'),
    progressCard: document.getElementById('progress-card'),
    doneCard: document.getElementById('done-card'),
    errorCard: document.getElementById('error-card'),
    
    // Idle card elements
    urlInput: document.getElementById('url-input'),
    urlError: document.getElementById('url-error'),
    downloadBtn: document.getElementById('download-btn'),
    pasteBtn: document.getElementById('paste-btn'),
    
    // Toggles
    toggleBtns: document.querySelectorAll('.toggle-btn'),
    
    // Quality/Format sections
    qualitySection: document.getElementById('quality-section'),
    formatSection: document.getElementById('format-section'),
    qualityBtns: document.querySelectorAll('.quality-btn'),
    
    // Progress elements
    phaseLabel: document.getElementById('phase-label'),
    progressFill: document.getElementById('progress-fill'),
    progressBar: document.getElementById('progress-bar'),
    mergeSpinner: document.getElementById('merge-spinner'),
    statPercent: document.getElementById('stat-percent'),
    statSpeed: document.getElementById('stat-speed'),
    statEta: document.getElementById('stat-eta'),
    filesizeLine: document.getElementById('filesize-line'),
    
    // Done elements
    downloadFileBtn: document.getElementById('download-file-btn'),
    startOverBtn: document.getElementById('start-over-btn'),
    doneFilename: document.getElementById('done-filename'),
    doneFilesize: document.getElementById('done-filesize'),
    
    // Error elements
    errorRetryBtn: document.getElementById('error-retry-btn'),
    errorMessage: document.getElementById('error-message'),
};

// ─────────────────────────────────────────────────────────────────────────
// Event Listeners - Setup
// ─────────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    setupToggleListeners();
    setupQualityListeners();
    setupDownloadListener();
    setupDoneListener();
    setupErrorListener();
    setupURLInput();
    setupPasteButton();
});

// ─────────────────────────────────────────────────────────────────────────
// Toggle Listeners
// ─────────────────────────────────────────────────────────────────────────

function setupToggleListeners() {
    elements.toggleBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            elements.toggleBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            currentType = btn.dataset.type;
            updateVisibleQualitySection();
            clearValidationError();
        });
    });
}

function updateVisibleQualitySection() {
    if (currentType === 'video') {
        elements.qualitySection.classList.add('active');
        elements.formatSection.classList.remove('active');
    } else {
        elements.qualitySection.classList.remove('active');
        elements.formatSection.classList.add('active');
    }
}

// ─────────────────────────────────────────────────────────────────────────
// Quality Listeners
// ─────────────────────────────────────────────────────────────────────────

function setupQualityListeners() {
    elements.qualityBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const container = btn.parentElement;
            container.querySelectorAll('.quality-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            if (btn.dataset.quality) {
                currentVideoQuality = btn.dataset.quality;
            } else if (btn.dataset.format) {
                currentAudioQuality = btn.dataset.format;
            }
        });
    });
}

// ─────────────────────────────────────────────────────────────────────────
// Download Listener
// ─────────────────────────────────────────────────────────────────────────

function setupDownloadListener() {
    elements.downloadBtn.addEventListener('click', () => {
        const url = elements.urlInput.value.trim();
        
        if (!url) {
            showValidationError('Please enter a URL');
            return;
        }
        
        if (!validateURL(url)) {
            showValidationError('Invalid YouTube or Facebook URL');
            return;
        }
        
        submitDownload(url);
    });
}

function validateURL(url) {
    return SUPPORTED_URL_PATTERNS.some(pattern => pattern.test(url));
}

function showValidationError(message) {
    elements.urlError.textContent = message;
}

function clearValidationError() {
    elements.urlError.textContent = '';
}

// ─────────────────────────────────────────────────────────────────────────
// URL Input Listener
// ─────────────────────────────────────────────────────────────────────────

function setupURLInput() {
    elements.urlInput.addEventListener('focus', clearValidationError);
    elements.urlInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && currentState === STATE.IDLE) {
            elements.downloadBtn.click();
        }
    });
}

// ─────────────────────────────────────────────────────────────────────────
// Paste Button Listener
// ─────────────────────────────────────────────────────────────────────────

function setupPasteButton() {
    if (!elements.pasteBtn) return;
    
    elements.pasteBtn.addEventListener('click', async () => {
        try {
            const text = await navigator.clipboard.readText();
            elements.urlInput.value = text;
            clearValidationError();
            elements.urlInput.focus();
        } catch (err) {
            showValidationError('Unable to access clipboard');
        }
    });
}

// ─────────────────────────────────────────────────────────────────────────
// Done State Listeners
// ─────────────────────────────────────────────────────────────────────────

function setupDoneListener() {
    elements.downloadFileBtn.addEventListener('click', () => {
        triggerFileDownload(currentJobId);
    });
    
    elements.startOverBtn.addEventListener('click', () => {
        resetUI();
    });
}

// ─────────────────────────────────────────────────────────────────────────
// Error State Listeners
// ─────────────────────────────────────────────────────────────────────────

function setupErrorListener() {
    elements.errorRetryBtn.addEventListener('click', () => {
        resetUI();
    });
}

// ─────────────────────────────────────────────────────────────────────────
// API Communication
// ─────────────────────────────────────────────────────────────────────────

async function submitDownload(url) {
    try {
        clearValidationError();
        switchToState(STATE.LOADING);
        
        const payload = {
            url: url,
            type: currentType,
            video_quality: currentVideoQuality,
            audio_quality: currentAudioQuality,
        };
        
        const response = await fetch(`${BACKEND_URL}/download`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });
        
        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.detail || 'Failed to start download');
        }
        
        const data = await response.json();
        currentJobId = data.job_id;
        
        switchToState(STATE.DOWNLOADING);
        listenToProgress(currentJobId);
        
    } catch (error) {
        showError(error.message || 'Failed to submit download');
        switchToState(STATE.ERROR);
    }
}

function listenToProgress(jobId) {
    if (eventSource) {
        eventSource.close();
    }
    
    eventSource = new EventSource(`${BACKEND_URL}/progress/${jobId}`);
    
    eventSource.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            
            // Check if this is a completion event
            if (data.status) {
                eventSource.close();
                
                if (data.status === 'done') {
                    showDone(data);
                    switchToState(STATE.DONE);
                } else if (data.status === 'error') {
                    showError(data.message || 'Unknown error');
                    switchToState(STATE.ERROR);
                }
                return;
            }
            
            // Regular progress update
            updateProgress(data);
            
        } catch (error) {
            console.error('Error parsing SSE message:', error);
        }
    };
    
    eventSource.onerror = (error) => {
        console.error('SSE error:', error);
        eventSource.close();
        showError('Connection lost');
        switchToState(STATE.ERROR);
    };
}

function updateProgress(data) {
    // Update phase
    const phase = data.phase || 'downloading';
    updatePhaseLabel(phase);
    
    // Toggle merge spinner
    if (phase === 'merging') {
        elements.progressBar.style.display = 'none';
        elements.mergeSpinner.classList.remove('hidden');
        switchToState(STATE.MERGING);
    } else {
        elements.progressBar.style.display = 'block';
        elements.mergeSpinner.classList.add('hidden');
    }
    
    // Update progress bar
    const percent = data.percent || 0;
    elements.progressFill.style.width = percent + '%';
    elements.statPercent.textContent = percent.toFixed(1) + '%';
    
    // Update speed and ETA
    elements.statSpeed.textContent = data.speed || '0 B/s';
    elements.statEta.textContent = data.eta || 'calculating...';
    
    // Update filesize
    if (data.filesize && data.filesize !== '?') {
        elements.filesizeLine.textContent = `File size: ${data.filesize}`;
    }
    
    // Update filename if available (shown during final stage)
    if (data.filename && data.percent >= 95) {
        elements.filesizeLine.textContent = `${data.filename}`;
    }
}

function updatePhaseLabel(phase) {
    const phaseMap = {
        'downloading': 'DOWNLOADING VIDEO',
        'merging': 'MERGING STREAMS',
        'done': 'DONE',
    };
    
    if (currentType === 'audio' && phase === 'downloading') {
        elements.phaseLabel.textContent = 'DOWNLOADING AUDIO';
    } else {
        elements.phaseLabel.textContent = phaseMap[phase] || phase.toUpperCase();
    }
}

async function triggerFileDownload(jobId) {
    try {
        const response = await fetch(`${BACKEND_URL}/file/${jobId}`);
        
        if (!response.ok) {
            throw new Error('Failed to download file');
        }
        
        const blob = await response.blob();
        
        // Use the actual filename from the done card (which includes proper extension)
        const filename = elements.doneFilename.textContent || 'download';
        
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
        
    } catch (error) {
        showError('Failed to download file: ' + error.message);
    }
}

// ─────────────────────────────────────────────────────────────────────────
// UI State Management
// ─────────────────────────────────────────────────────────────────────────

function switchToState(state) {
    currentState = state;
    
    // Hide all cards
    elements.idleCard.classList.add('hidden');
    elements.progressCard.classList.add('hidden');
    elements.doneCard.classList.add('hidden');
    elements.errorCard.classList.add('hidden');
    
    // Show appropriate card
    switch (state) {
        case STATE.IDLE:
            elements.idleCard.classList.remove('hidden');
            elements.downloadBtn.disabled = false;
            break;
        case STATE.LOADING:
        case STATE.DOWNLOADING:
        case STATE.MERGING:
            elements.progressCard.classList.remove('hidden');
            break;
        case STATE.DONE:
            elements.doneCard.classList.remove('hidden');
            break;
        case STATE.ERROR:
            elements.errorCard.classList.remove('hidden');
            break;
    }
}

function showDone(data) {
    elements.doneFilename.textContent = data.filename || 'file';
    elements.doneFilesize.textContent = `File size: ${data.filesize_mb} MB`;
}

function showError(message) {
    elements.errorMessage.textContent = message;
}

function resetUI() {
    if (eventSource) {
        eventSource.close();
        eventSource = null;
    }
    
    currentJobId = null;
    currentState = STATE.IDLE;
    
    // Reset form
    elements.urlInput.value = '';
    elements.urlError.textContent = '';
    
    // Reset toggles
    elements.toggleBtns.forEach(btn => btn.classList.remove('active'));
    elements.toggleBtns[0].classList.add('active');
    currentType = 'video';
    
    // Reset quality buttons
    const activeQualityBtn = elements.qualitySection.querySelector('.quality-btn[data-quality="best"]');
    if (activeQualityBtn) {
        elements.qualitySection.querySelectorAll('.quality-btn').forEach(b => b.classList.remove('active'));
        activeQualityBtn.classList.add('active');
        currentVideoQuality = 'best';
    }
    
    const activeFormatBtn = elements.formatSection.querySelector('.quality-btn[data-format="mp3_320"]');
    if (activeFormatBtn) {
        elements.formatSection.querySelectorAll('.quality-btn').forEach(b => b.classList.remove('active'));
        activeFormatBtn.classList.add('active');
        currentAudioQuality = 'mp3_320';
    }
    
    // Reset progress
    elements.progressFill.style.width = '0%';
    elements.statPercent.textContent = '0%';
    elements.statSpeed.textContent = '0 B/s';
    elements.statEta.textContent = 'calculating...';
    elements.filesizeLine.textContent = '';
    elements.progressBar.style.display = 'block';
    elements.mergeSpinner.classList.add('hidden');
    
    updateVisibleQualitySection();
    switchToState(STATE.IDLE);
}
