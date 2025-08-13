/**
 * MindAR Image Compiler Script
 * Uploads an image to MindAR online compiler and downloads the compiled .mind file
 * Based on the actual UI flow of hiukim.github.io/mind-ar-js-doc/tools/compile
 */

class MindARCompiler {
    constructor() {
        this.compilerURL = 'https://hiukim.github.io/mind-ar-js-doc/tools/compile';
        this.compiledFile = null;
        this.onProgress = null;
        this.onComplete = null;
        this.onError = null;
        this.iframe = null;
    }

    /**
     * Set callback functions
     * @param {Function} onProgress - Called with progress updates
     * @param {Function} onComplete - Called when compilation is complete with the .mind file
     * @param {Function} onError - Called when an error occurs
     */
    setCallbacks(onProgress, onComplete, onError) {
        this.onProgress = onProgress;
        this.onComplete = onComplete;
        this.onError = onError;
    }

    /**
     * Compile an image file to .mind format
     * @param {File} imageFile - The image file to compile
     * @returns {Promise} Promise that resolves with the compiled .mind file
     */
    async compileImage(imageFile) {
        try {
            // Validate input
            if (!imageFile || !(imageFile instanceof File)) {
                throw new Error('Please provide a valid image file');
            }

            // Check if it's an image
            if (!imageFile.type.startsWith('image/')) {
                throw new Error('File must be an image');
            }

            this.onProgress?.('Loading MindAR compiler...');

            // Create iframe to handle the compilation process
            this.iframe = await this.createCompilerFrame();
            
            // Upload and compile the image
            const mindFile = await this.processCompilation(imageFile);
            
            // Clean up
            this.cleanup();
            
            this.compiledFile = mindFile;
            this.onComplete?.(mindFile);
            
            return mindFile;

        } catch (error) {
            this.cleanup();
            this.onError?.(error.message);
            throw error;
        }
    }

    /**
     * Create an iframe for the compiler
     * @returns {Promise<HTMLIFrameElement>} The iframe element
     */
    createCompilerFrame() {
        return new Promise((resolve, reject) => {
            const iframe = document.createElement('iframe');
            iframe.src = this.compilerURL;
            iframe.style.position = 'absolute';
            iframe.style.top = '-9999px';
            iframe.style.left = '-9999px';
            iframe.style.width = '1200px';
            iframe.style.height = '800px';
            iframe.style.border = 'none';
            
            // Add CORS headers if possible
            iframe.setAttribute('sandbox', 'allow-same-origin allow-scripts allow-forms');
            
            iframe.onload = () => {
                this.onProgress?.('Compiler loaded successfully');
                // Wait a bit for the page to fully initialize
                setTimeout(() => resolve(iframe), 2000);
            };
            
            iframe.onerror = () => {
                reject(new Error('Failed to load MindAR compiler'));
            };
            
            document.body.appendChild(iframe);
        });
    }

    /**
     * Process the image compilation
     * @param {File} imageFile - The image file to process
     * @returns {Promise<File>} The compiled .mind file
     */
    async processCompilation(imageFile) {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Compilation timeout - process took too long'));
            }, 300000); // 5 minute timeout

            try {
                // Wait for iframe to be fully ready
                setTimeout(async () => {
                    try {
                        await this.uploadAndStartCompilation(imageFile);
                        await this.monitorProgress();
                        const mindFile = await this.downloadCompiledFile();
                        clearTimeout(timeout);
                        resolve(mindFile);
                    } catch (error) {
                        clearTimeout(timeout);
                        reject(error);
                    }
                }, 3000);
            } catch (error) {
                clearTimeout(timeout);
                reject(error);
            }
        });
    }

    /**
     * Upload image and start compilation
     * @param {File} imageFile - The image file to upload
     */
    async uploadAndStartCompilation(imageFile) {
        const iframeDoc = this.iframe.contentDocument || this.iframe.contentWindow.document;
        
        // Method 1: Try to find the drop zone and simulate drop
        const dropZone = iframeDoc.querySelector('[class*="drop"], [class*="upload"], .upload-area, #upload-area');
        
        if (dropZone) {
            this.onProgress?.('Uploading image to drop zone...');
            await this.simulateFileDrop(dropZone, imageFile);
        } else {
            // Method 2: Look for file input
            const fileInput = iframeDoc.querySelector('input[type="file"]');
            if (fileInput) {
                this.onProgress?.('Uploading via file input...');
                await this.setFileInput(fileInput, imageFile);
            } else {
                throw new Error('Could not find upload interface in compiler');
            }
        }

        // Wait a moment for the file to be processed
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Look for and click the Start button
        const startButton = iframeDoc.querySelector('button:contains("Start"), .start-btn, [class*="start"]');
        if (startButton && startButton.textContent.toLowerCase().includes('start')) {
            this.onProgress?.('Starting compilation...');
            startButton.click();
        } else {
            // Try to find any button that might start the process
            const buttons = iframeDoc.querySelectorAll('button');
            for (let button of buttons) {
                if (button.textContent.toLowerCase().includes('start') || 
                    button.textContent.toLowerCase().includes('compile') ||
                    button.style.backgroundColor.includes('rgb(52, 211, 153)') || // Teal color from screenshot
                    button.classList.contains('bg-teal-500')) {
                    button.click();
                    break;
                }
            }
        }
    }

    /**
     * Simulate file drop on drop zone
     * @param {Element} dropZone - The drop zone element
     * @param {File} file - The file to drop
     */
    async simulateFileDrop(dropZone, file) {
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);

        const dropEvent = new DragEvent('drop', {
            bubbles: true,
            cancelable: true,
            dataTransfer: dataTransfer
        });

        dropZone.dispatchEvent(dropEvent);
    }

    /**
     * Set file input value
     * @param {Element} fileInput - The file input element
     * @param {File} file - The file to set
     */
    async setFileInput(fileInput, file) {
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        fileInput.files = dataTransfer.files;
        
        fileInput.dispatchEvent(new Event('change', { bubbles: true }));
    }

    /**
     * Monitor compilation progress
     */
    async monitorProgress() {
        return new Promise((resolve, reject) => {
            let lastProgress = 0;
            const checkInterval = 2000; // Check every 2 seconds
            const maxChecks = 150; // 5 minutes max
            let checks = 0;

            const checkProgress = () => {
                checks++;
                
                try {
                    const iframeDoc = this.iframe.contentDocument || this.iframe.contentWindow.document;
                    
                    // Look for progress indicator
                    const progressText = iframeDoc.querySelector('[class*="progress"], .progress-text');
                    const progressElement = iframeDoc.body.textContent || iframeDoc.body.innerText || '';
                    
                    // Extract progress percentage
                    const progressMatch = progressElement.match(/Progress:\s*(\d+(?:\.\d+)?)\s*%/i);
                    if (progressMatch) {
                        const currentProgress = parseFloat(progressMatch[1]);
                        if (currentProgress !== lastProgress) {
                            lastProgress = currentProgress;
                            this.onProgress?.(`Compiling... ${currentProgress.toFixed(1)}%`);
                        }
                    }

                    // Check if compilation is complete
                    const downloadButton = iframeDoc.querySelector('button:contains("Download"), [class*="download"], .download-btn');
                    const downloadButtonText = Array.from(iframeDoc.querySelectorAll('button'))
                        .find(btn => btn.textContent.toLowerCase().includes('download'));
                    
                    if (downloadButton || downloadButtonText) {
                        this.onProgress?.('Compilation complete! Ready to download.');
                        resolve();
                        return;
                    }

                    // Check for errors
                    const errorElement = iframeDoc.querySelector('.error, [class*="error"], .alert-error');
                    if (errorElement && errorElement.textContent.trim()) {
                        reject(new Error('Compilation failed: ' + errorElement.textContent));
                        return;
                    }

                    // Continue checking if not done and not timed out
                    if (checks < maxChecks) {
                        setTimeout(checkProgress, checkInterval);
                    } else {
                        reject(new Error('Compilation timeout - process took too long'));
                    }

                } catch (error) {
                    // If we can't access iframe (CORS), continue checking
                    if (checks < maxChecks) {
                        setTimeout(checkProgress, checkInterval);
                    } else {
                        reject(new Error('Could not monitor progress: ' + error.message));
                    }
                }
            };

            // Start monitoring
            setTimeout(checkProgress, checkInterval);
        });
    }

    /**
     * Download the compiled .mind file
     * @returns {Promise<File>} The compiled file
     */
    async downloadCompiledFile() {
        const iframeDoc = this.iframe.contentDocument || this.iframe.contentWindow.document;
        
        // Find the download button
        const downloadButtons = Array.from(iframeDoc.querySelectorAll('button'))
            .filter(btn => btn.textContent.toLowerCase().includes('download'));
        
        if (downloadButtons.length === 0) {
            throw new Error('Download button not found');
        }

        const downloadButton = downloadButtons[0];
        
        return new Promise((resolve, reject) => {
            // Set up download interception
            const originalCreateElement = iframeDoc.createElement;
            iframeDoc.createElement = function(tagName) {
                const element = originalCreateElement.call(this, tagName);
                if (tagName.toLowerCase() === 'a' && element.download) {
                    // Intercept download
                    const originalClick = element.click;
                    element.click = function() {
                        // Get the blob URL
                        fetch(element.href)
                            .then(response => response.blob())
                            .then(blob => {
                                const filename = element.download || 'compiled.mind';
                                const file = new File([blob], filename, { 
                                    type: 'application/octet-stream' 
                                });
                                resolve(file);
                            })
                            .catch(reject);
                    };
                }
                return element;
            };

            // Click the download button
            this.onProgress?.('Initiating download...');
            downloadButton.click();
            
            // Fallback timeout
            setTimeout(() => {
                reject(new Error('Download timeout'));
            }, 30000);
        });
    }

    /**
     * Clean up resources
     */
    cleanup() {
        if (this.iframe && this.iframe.parentNode) {
            this.iframe.parentNode.removeChild(this.iframe);
            this.iframe = null;
        }
    }

    /**
     * Get the last compiled file
     * @returns {File|null} The compiled .mind file
     */
    getCompiledFile() {
        return this.compiledFile;
    }

    /**
     * Create a download link for the compiled file
     * @param {string} filename - Optional custom filename
     * @returns {HTMLAnchorElement} Download link element
     */
    createDownloadLink(filename = 'compiled.mind') {
        if (!this.compiledFile) {
            throw new Error('No compiled file available');
        }
        
        const url = URL.createObjectURL(this.compiledFile);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.textContent = `Download ${filename}`;
        link.className = 'download-link';
        link.style.cssText = `
            display: inline-block;
            padding: 10px 20px;
            background-color: #34d399;
            color: white;
            text-decoration: none;
            border-radius: 5px;
            margin: 10px 0;
        `;
        
        return link;
    }
}

// Enhanced usage example with better error handling:
async function compileMindARImage(imageFile, callbacks = {}) {
    const compiler = new MindARCompiler();
    
    // Set up callbacks
    compiler.setCallbacks(
        callbacks.onProgress || ((msg) => console.log('Progress:', msg)),
        callbacks.onComplete || ((file) => console.log('Complete:', file)),
        callbacks.onError || ((err) => console.error('Error:', err))
    );
    
    try {
        return await compiler.compileImage(imageFile);
    } catch (error) {
        console.error('Compilation failed:', error.message);
        throw error;
    }
}

// Alternative approach using postMessage for better iframe communication
class MindARCompilerWithMessaging extends MindARCompiler {
    constructor() {
        super();
        this.messageListener = null;
    }

    async processCompilation(imageFile) {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Compilation timeout'));
            }, 300000);

            // Set up message listener
            this.messageListener = (event) => {
                if (event.origin !== 'https://hiukim.github.io') return;
                
                const { type, data } = event.data;
                
                switch (type) {
                    case 'progress':
                        this.onProgress?.(data.message);
                        break;
                    case 'complete':
                        clearTimeout(timeout);
                        this.downloadFile(data.downloadUrl)
                            .then(resolve)
                            .catch(reject);
                        break;
                    case 'error':
                        clearTimeout(timeout);
                        reject(new Error(data.message));
                        break;
                }
            };

            window.addEventListener('message', this.messageListener);
            
            // Send file to iframe
            this.sendFileToIframe(imageFile);
        });
    }

    cleanup() {
        super.cleanup();
        if (this.messageListener) {
            window.removeEventListener('message', this.messageListener);
            this.messageListener = null;
        }
    }
}

// Export for use in modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { 
        MindARCompiler, 
        MindARCompilerWithMessaging,
        compileMindARImage 
    };
}

// Usage example:
/*
// Basic usage
const fileInput = document.getElementById('imageInput');
fileInput.addEventListener('change', async (event) => {
    const file = event.target.files[0];
    if (file) {
        const compiler = new MindARCompiler();
        
        compiler.setCallbacks(
            (progress) => {
                console.log(progress);
                document.getElementById('status').textContent = progress;
            },
            (mindFile) => {
                console.log('Success! Got .mind file:', mindFile);
                const downloadLink = compiler.createDownloadLink();
                document.body.appendChild(downloadLink);
            },
            (error) => {
                console.error('Failed:', error);
                document.getElementById('status').textContent = 'Error: ' + error;
            }
        );
        
        try {
            await compiler.compileImage(file);
        } catch (error) {
            console.error('Compilation failed:', error);
        }
    }
});
*/
