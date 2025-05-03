/** * Script for handling search queries and displaying results */

let memoryData = null;

document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const searchForm = document.getElementById('searchForm');
    const searchQuery = document.getElementById('searchQuery');
    const resultsSection = document.getElementById('resultsSection');
    const resultsCount = document.getElementById('resultsCount');
    const resultsList = document.getElementById('resultsList');
    const noResultsMessage = document.getElementById('noResultsMessage');
    const loadingIndicator = document.getElementById('loadingIndicator');
    const errorMessage = document.getElementById('errorMessage');
    const queryTime = document.getElementById('queryTime');

    // Search form handler
    searchForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        console.log('Search form submitted');

        const query = searchQuery.value;
        if (!query) {
            errorMessage.textContent = 'Please enter a search query';
            errorMessage.style.display = 'block';
            return;
        }

        // Clear previous results and messages
        resultsList.innerHTML = '';
        resultsSection.style.display = 'none';
        noResultsMessage.style.display = 'none';
        errorMessage.style.display = 'none';
        loadingIndicator.style.display = 'block';

        try {
            let start = performance.now();
            console.log('Sending search request:', query);
            const response = await fetch('/api/search', {
                method: 'POST', headers: {
                    'Content-Type': 'application/json'
                }, body: JSON.stringify({query})
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Unknown error');
            }

            let end = performance.now();
            let timeTaken = ((end - start) / 1000).toFixed(3);
            queryTime.textContent = `Query time: ${timeTaken} s`;

            console.log('Search results:', data);

            if (!data.results || data.results.length === 0) {
                noResultsMessage.style.display = 'block';
            } else {
                resultsCount.textContent = String(data.results.length);
                resultsSection.style.display = 'block';

                memoryData = data.results; // Store results in memory for later use

                data.results.forEach((doc, index) => {
                    const resultItem = document.createElement('div');
                    resultItem.className = 'list-group-item result-card';

                    const id = doc._id || 'PLACEHOLDER';
                    const title = doc.title || 'PLACEHOLDER';
                    const content = doc.content || 'PLACEHOLDER';
                    const rank = doc.rank !== undefined ? doc.rank : 'N/A';

                    // Создаем превью с контекстом вокруг совпадения
                    const matchIndex = content.toLowerCase().indexOf(query.toLowerCase());
                    let preview = content;
                    if (matchIndex !== -1) {
                        const start = Math.max(0, matchIndex - 50);
                        const end = Math.min(content.length, matchIndex + query.length + 50);
                        preview = content.slice(start, end) + '...';
                    } else if (content.length > 200) {
                        preview = content.slice(0, 200) + '...';
                    }

                    resultItem.innerHTML = `
        <div class="d-flex justify-content-between align-items-center">
            <div class="d-flex align-items-center">
                <span class="badge bg-primary rounded-pill me-2">${index + 1}</span>
                <h5 class="mb-1">${title}</h5>
            </div>
            <div>
                <small class="text-muted me-2">Rank: ${rank}</small>
                <small class="text-muted">ID: ${id}</small>
            </div>
        </div>
        <p class="mb-1">${preview}</p>
    `;
                    resultItem.dataset.full = content;
                    resultItem.dataset.preview = preview;
                    resultItem.dataset.isFull = "false";

                    resultItem.addEventListener('click', () => {
                        if (memoryData !== null) {
                            const para = resultItem.querySelector('p.mb-1');
                            if (resultItem.dataset.isFull === "true") {
                                para.textContent = resultItem.dataset.preview;
                                resultItem.dataset.isFull = "false";
                            } else {
                                para.textContent = resultItem.dataset.full;
                                resultItem.dataset.isFull = "true";
                            }
                        }
                    });

                    resultsList.appendChild(resultItem);
                });
            }
        } catch (error) {
            console.error('Search error:', error);
            errorMessage.textContent = error.message || 'An error occurred while searching';
            errorMessage.style.display = 'block';
        } finally {
            loadingIndicator.style.display = 'none';
        }
    });


});