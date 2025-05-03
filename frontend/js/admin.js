/** Admin panel functionality script */

document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const loginSection = document.getElementById('loginSection');
    const adminPanel = document.getElementById('adminPanel');
    const loginForm = document.getElementById('loginForm');
    const documentForm = document.getElementById('documentForm');
    const documentList = document.getElementById('documentList');
    const loadingIndicator = document.getElementById('loadingIndicator');
    const errorMessage = document.getElementById('errorMessage');
    const refreshButton = document.getElementById('refreshButton');
    const updateButton = document.getElementById('updateButton');
    const dropButton = document.getElementById('dropButton');

    // Login form handler
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const password = document.getElementById('password').value;
        // loadingIndicator.style.display = 'block';
        errorMessage.style.display = 'none';

        try {
            const response = await fetch('/api/admin/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ password })
            });

            if (response.ok) {
                localStorage.setItem('isAuthenticated', 'true');
                showAdminPanel();
            } else {
                throw new Error('Invalid password. Please try again.');
            }
        } catch (error) {
            errorMessage.textContent = error.message;
            errorMessage.style.display = 'block';
        } finally {
            // loadingIndicator.style.display = 'none'; // WORKS FAST ENOUGH, DON'T NEED LOADING PIC
        }
    });

    // Document form handler
    documentForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const title = document.getElementById('title').value;
        const content = document.getElementById('content').value;

        loadingIndicator.style.display = 'block';
        errorMessage.style.display = 'none';

        try {
            const response = await fetch('/api/admin/documents', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ title, content })
            });

            if (!response.ok) {
                throw new Error('Failed to add document');
            }

            // Clear form and refresh document list
            documentForm.reset();
            await loadDocuments();
        } catch (error) {
            errorMessage.textContent = error.message;
            errorMessage.style.display = 'block';
        } finally {
            loadingIndicator.style.display = 'none';
        }
    });

    // Refresh data button handler
    refreshButton.addEventListener('click', async () => {
        if (!confirm(`
        Are you sure you want to refresh the data?
        This will DELETE ALL existing documents,
        scrap all *.csv files from folder '/data'
        and evaluate gotten documents.
        IT WILL TAKE A WHILE!`)) {

            return;
        }

        loadingIndicator.style.display = 'block';
        errorMessage.style.display = 'none';
        documentList.style.visibility = 'collapse';
        refreshButton.disabled = true;

        try {
            let start = performance.now();
            const response = await fetch('/api/admin/refresh-data', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to update data');
            }

            await loadDocuments();
            let end = performance.now();
            alert('\nData has been refreshed successfully: ' + ((end - start) / 1000).toFixed(3) + 's');

        } catch (error) {
            errorMessage.textContent = error.message;
            errorMessage.style.display = 'block';
        } finally {
            loadingIndicator.style.display = 'none';
            documentList.style.visibility = 'visible';
            refreshButton.disabled = false;
        }
    });

    // Update data button handler
    updateButton.addEventListener('click', async () => {
        if (!confirm(`
        Are you sure you want to update the data?
        This will reevaluate all documents from DB.
        IT WILL TAKE A WHILE!`)) {

            return;
        }

        loadingIndicator.style.display = 'block';
        errorMessage.style.display = 'none';
        documentList.style.visibility = 'collapse';
        updateButton.disabled = true;

        try {
            let start = performance.now();
            const response = await fetch('/api/admin/update-data', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to update data');
            }

            let end = performance.now();
            alert('\nData has been updated successfully: ' + ((end - start) / 1000).toFixed(3) + 's');

        } catch (error) {
            errorMessage.textContent = error.message;
            errorMessage.style.display = 'block';
        } finally {
            loadingIndicator.style.display = 'none';
            documentList.style.visibility = 'visible';
            updateButton.disabled = false;
        }
    });

    // Drop data button handler
    dropButton.addEventListener('click', async () => {
        if (!confirm('\nAre you sure you want to drop the data?')) {
            return;
        }

        loadingIndicator.style.display = 'block';
        errorMessage.style.display = 'none';
        dropButton.disabled = true;

        try {

            const response = await fetch('/api/admin/drop-data', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to drop data');
            }

            alert('\nData has been successfully dropped');
            await loadDocuments();
        } catch (error) {
            errorMessage.textContent = error.message;
            errorMessage.style.display = 'block';
        } finally {
            loadingIndicator.style.display = 'none';
            dropButton.disabled = false;
        }
    });

    /** Show admin panel and load documents */
    function showAdminPanel() {
        loginSection.style.display = 'none';
        adminPanel.style.display = 'block';
        loadDocuments();
    }

    /** Load and display documents */
    async function loadDocuments() {
        loadingIndicator.style.display = 'block';
        try {
            const response = await fetch('/api/admin/documents');
            
            if (!response.ok) {
                throw new Error('Failed to fetch documents');
            }
            
            const documents = await response.json();
            displayDocuments(documents);
        } catch (error) {
            errorMessage.textContent = error.message;
            errorMessage.style.display = 'block';
        } finally {
            loadingIndicator.style.display = 'none';
        }
    }

    /**
     * Display documents in the table
     * @param {Array} documents - Array of documents to display
     */
    function displayDocuments(documents) {
        documentList.innerHTML = '';

        // Check up if not undefined/null
        if (!documents || !Array.isArray(documents)) {
            errorMessage.textContent = 'Error: failed to get list of documents';
            errorMessage.style.display = 'block';
            return;
        }
        
        if (documents.length === 0) {
            const emptyRow = document.createElement('tr');
            emptyRow.innerHTML = `<td colspan="5" class="text-center">Nothing has been added to the database yet</td>`;
            documentList.appendChild(emptyRow);
            return;
        }
        
        documents.forEach((doc, index) => {
            const row = document.createElement('tr');

            // extracts data with checks in a safe way
            const title = doc && doc.title ? doc.title : 'PLACEHOLDER';
            const content = doc && doc.content ? doc.content : 'PLACEHOLDER';
            const docId = doc && doc._id ? doc._id : '';
            
            row.innerHTML = `
                <td class="text-center">${index + 1}</td>
                <td>${docId}</td>
                <td>${title}</td>
                <td>${truncateText(content, 100)}</td>
                <td>
                    <button class="btn btn-danger btn-sm" onclick="deleteDocument('${docId}')">
                        <i class="bi bi-trash"></i> Delete
                    </button>
                </td>
            `;
            
            documentList.appendChild(row);
        });
    }

    /**
     * Delete document by ID
     * @param {string} id - Document ID
     */
    window.deleteDocument = async (id) => {
        if (!confirm('Are you sure you want to delete this document?')) {
            return;
        }
        
        loadingIndicator.style.display = 'block';
        errorMessage.style.display = 'none';

        try {
            const response = await fetch(`/api/admin/documents/${id}`, {
                method: 'DELETE'
            });

            if (!response.ok) {
                throw new Error('Failed to delete document');
            }

            await loadDocuments();
        } catch (error) {
            errorMessage.textContent = error.message;
            errorMessage.style.display = 'block';
        } finally {
            loadingIndicator.style.display = 'none';
        }
    };

    /**
     * Truncate text to specified length
     * @param {string} text - Text to truncate
     * @param {number} length - Maximum length
     * @returns {string} Truncated text
     */
    function truncateText(text, length) {
        if (!text) return '';
        if (text.length <= length) return text;
        return text.substring(0, length) + '...';
    }
}); 