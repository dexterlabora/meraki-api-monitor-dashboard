// Constants and State
const ctx = document.getElementById('apiRequestsChart').getContext('2d');
const timespanSelect = document.getElementById('timespanSelect');
const tableBody = document.querySelector('#viz3 tbody');
const apiKeyInput = document.getElementById('apiKey');
const organizationSelect = document.getElementById('organizationSelect');
const configModal = document.getElementById('configModal');
const configToggle = document.getElementById('configToggle');
const closeModal = document.querySelector('.close');
const loader = document.getElementById('loader');
let chart, apiDataCache = {};
let allWebhookData = [];

// Initialize the application
function init() {
    initializeEventListeners();
    loadStoredConfig();
    fetchDataAndUpdateVis();
    // Initialize filters
    const filterInputs = document.querySelectorAll('.scrollable-table thead input[type="text"]');
    filterInputs.forEach(input => filterTable(input, input.dataset.columnIndex));
}

// Event Listeners
function initializeEventListeners() {
    configToggle.onclick = () => (configModal.style.display = 'block');
    closeModal.onclick = () => (configModal.style.display = 'none');
    window.onclick = (event) => (event.target === configModal ? configModal.style.display = 'none' : null);
    document.getElementById('configForm').onsubmit = handleConfigFormSubmit;
    organizationSelect.onchange = handleOrganizationChange;
    timespanSelect.addEventListener('change', handleTimespanChange);
    organizationSelect.onchange = async function () {
        const organizationId = this.value;
        if (!organizationId) {
            alert("Organization ID is required!");
            return;
        }
        localStorage.setItem('MerakiOrganizationId', organizationId);
        await fetchOrganizationAdmins(organizationId); // Fetch admins for the new organization
        fetchDataAndUpdateVis(); // Reinitialize visualizations with new Org settings
    };
}

function filterTable(input, columnIndex) {
    let filter = input.value.toUpperCase();
    let table = input.closest("table");
    let tr = table.getElementsByTagName("tr");

    // Loop through all table rows, and hide those who don't match the search query
    for (let i = 1; i < tr.length; i++) {
        let td = tr[i].getElementsByTagName("td")[columnIndex];
        if (td) {
            let txtValue = td.textContent || td.innerText;
            if (txtValue.toUpperCase().indexOf(filter) > -1) {
                tr[i].style.display = "";
            } else {
                tr[i].style.display = "none";
            }
        }
    }
    updateRecordCount();
}

// Load stored API key and Org ID
function loadStoredConfig() {
    if (localStorage.getItem('MerakiApiKey')) {
        apiKeyInput.value = localStorage.getItem('MerakiApiKey');
        fetchOrganizations();

    }
    if (localStorage.getItem('MerakiOrganizationId')) {
        organizationSelect.value = localStorage.getItem('MerakiOrganizationId');
        // fetchOrganizationAdmins(organizationSelect.value)
    }
}

// Config Form Submit Handler
function handleConfigFormSubmit(event) {
    event.preventDefault();
    const apiKey = apiKeyInput.value;
    if (!apiKey) {
        alert("API Key is required!");
        return;
    }
    localStorage.setItem('MerakiApiKey', apiKey);
    fetchOrganizations();
    configModal.style.display = 'none';
}

// Organization Change Handler
async function handleOrganizationChange() {
    const organizationId = organizationSelect.value;
    if (!organizationId) {
        alert("Organization ID is required!");
        return;
    }
    localStorage.setItem('MerakiOrganizationId', organizationId);
    await fetchOrganizationAdmins(organizationId); // Fetch admins for the new organization
    fetchDataAndUpdateVis();
}

// Timespan Change Handler
function handleTimespanChange() {
    const selectedTimespan = this.value;
    fetchDataAndUpdateVis(selectedTimespan);
}


function fetchOrganizations() {
    const apiKey = apiKeyInput.value;
    const headers = {
        'Authorization': apiKey,
        'Content-Type': 'application/json'
    };
    showLoader()
    fetch('/api/organizations', { headers })
        .then(response => response.json())
        .then(data => {
            organizationSelect.innerHTML = '<option value="">Select Organization</option>';
            data.forEach(org => {
                const option = document.createElement('option');
                option.value = org.id;
                option.textContent = `${org.name} (${org.id})`;
                organizationSelect.appendChild(option);
            });
            // Pre-select the organization if already saved
            if (localStorage.getItem('MerakiOrganizationId')) {
                organizationSelect.value = localStorage.getItem('MerakiOrganizationId');
            }
            hideLoader()
        })
        .catch(error => {
            hideLoader
            console.error('Error fetching organizations:', error);
            alert('Failed to fetch organizations. Check console for details.');
        });
}

// Fetches and stores admin data for the selected organization
async function fetchOrganizationAdmins(organizationId) {
    console.log("fetching admins for ", organizationId)
    const apiKey = localStorage.getItem('MerakiApiKey');
    if (!apiKey || !organizationId) {
        console.error("API Key and Organization ID must be set.");
        return;
    }

    const headers = {
        'Authorization': apiKey,
        'Content-Type': 'application/json'
    };

    await fetch(`/api/organizations/${organizationId}/admins`, { headers })
        .then(response => response.json())
        .then(admins => {
            // Save the admins data for later use in visualizations
            localStorage.setItem('MerakiAdmins', JSON.stringify(admins));
            return admins;
            //console.log('Admins fetched and stored:', admins);
        })
        .catch(error => {
            console.error('Error fetching organization admins:', error);
            alert('Failed to fetch organization admins.');
        });
}

// Fetch and Update Data
async function fetchDataAndUpdateVis(timespan = 'month') {
    showLoader();
    const apiKey = localStorage.getItem('MerakiApiKey');
    const organizationId = localStorage.getItem('MerakiOrganizationId');
    if (!apiKey || !organizationId) {
        alert("Configure API settings first.");
        return;
    }


    const headers = {
        'Authorization': apiKey,
        'Content-Type': 'application/json'
    };

    const merakiAdmins = localStorage.getItem('MerakiAdmins');


    const timespanSeconds = getTimespanInSeconds(timespan);

    // Fetch API Requests and update visualization when data arrives
    fetch(`/api/organizations/${organizationId}/apiRequests?timespan=${timespanSeconds}&perPage=1000`, { headers })
        .then(res => res.json())
        .then(apiRequestsData => {
            updateVisualization3(apiRequestsData);
            updateApiRequestAnalysis(apiRequestsData, merakiAdmins);
        }).catch(handleError);

    // Fetch API Requests Overview and update visualization when data arrives
    fetch(`/api/organizations/${organizationId}/apiRequests/overview?timespan=${timespanSeconds}`, { headers })
        .then(res => res.json())
        .then(apiRequestsOverviewData => {
            updateVisualization2(apiRequestsOverviewData, allWebhookData); // Assumes allWebhookData is available or handle appropriately
        }).catch(handleError);

    // Fetch Response Codes by Interval and update visualization when data arrives
    fetch(`/api/organizations/${organizationId}/apiRequests/overview/responseCodes/byInterval?timespan=${timespanSeconds}`, { headers })
        .then(res => res.json())
        .then(responseCodesData => {
            allApiResponseData = responseCodesData; // Store for filtering if needed
            updateVisualization1(responseCodesData);
        }).catch(handleError)
        .finally(() => hideLoader());  // improve this - should wait for all requests to load befor hiding loader



    // Fetch Webhook Logs and update visualization when data arrives
    fetch(`/api/organizations/${organizationId}/webhooks/logs?timespan=${timespanSeconds}&perPage=1000`, { headers })
        .then(res => res.json())
        .then(webhookLogsData => {
            allWebhookData = webhookLogsData; // Store for filtering if needed
            updateVisualization4(webhookLogsData);
            updateWebhookLogAnalysis(webhookLogsData);
        }).catch(handleError)

}

// Utility Functions
function showLoader() {
    loader.style.display = 'block';
}

function hideLoader() {
    loader.style.display = 'none';
}

function getTimespanInSeconds(timespan) {
    const timespanInSeconds = {
        'day': 86400, // 24 hours
        'week': 604800, // 7 days
        'month': 2592000 // 30 days
    };
    return timespanInSeconds[timespan] || timespanInSeconds['month']; // Default to 30 days if not specified
}

function handleError(error) {
    console.error('Error fetching data:', error);
    // alert('Failed to fetch data. Check console for details.');
    hideLoader();
}


// Visualization Functions


/**
* Gets a color based on the HTTP response code.
* @param {number} code - The HTTP response code.
* @returns {string} The color representing the type of response.
*/
function getColorForResponseCode(code) {
    // Use regex to test the code and assign a color.
    if (/^2/.test(code)) return 'green'; // Success responses.
    if (/^429$/.test(code)) return 'red'; // Rate limits.
    if (/^403$/.test(code)) return 'blue'; // Forbidden
    if (/^404$/.test(code)) return 'grey'; // Not Found 
    if (/^5/.test(code)) return 'brown'; // Server errors.
    if (/^4/.test(code)) return 'orange'; // Client errors.
    return 'grey'; // Default color.
}

// API Requests by Chart
function updateVisualization1(data) {
    const labels = data.map(item => {
        const date = new Date(item.startTs);
        return `${date.getMonth() + 1}/${date.getDate()}`; // Format: MM/DD
    });

    // Collect all unique response codes from the data
    const responseCodes = new Set(data.flatMap(item => item.counts.map(count => count.code)));

    // Create a dataset for each response code, with more descriptive labels
    const datasets = Array.from(responseCodes).map(code => ({
        label: `${getResponseCodeDescription(code)} (${code})`,
        backgroundColor: getColorForResponseCode(code),
        data: data.map(item => {
            const countObj = item.counts.find(count => count.code === code);
            return countObj ? countObj.count : 0;
        })
    }));

    if (chart) chart.destroy();
    chart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: datasets
        },
        options: {
            scales: {
                x: { stacked: true },
                y: { stacked: true, beginAtZero: true }
            },
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: true } }
        }
    });
}

function getResponseCodeDescription(code) {
    switch (true) {
        case /^2/.test(code.toString()):
            return "Success";
        case /^400$/.test(code.toString()):
            return "Client Error";
        case /^403$/.test(code.toString()):
            return "Forbidden";
        case /^404$/.test(code.toString()):
            return "Not Found";
        case /^429$/.test(code.toString()):
            return "Rate Limit Hit";
        case /^5/.test(code.toString()):
            return "Meraki Error";
        default:
            return "Other";
    }
}

// Visualization 2: Health - Number of API Requests & Webhooks Sent
function updateVisualization2(apiData, webhookData) {
    // Initialize counts
    let apiSuccessCount = apiData.responseCodeCounts['200'];
    let apiFailCount = Object.keys(apiData.responseCodeCounts)
        .filter(code => !code.startsWith('2'))
        .reduce((sum, code) => sum + apiData.responseCodeCounts[code], 0);
    let webhookSuccessCount = webhookData.filter(log => log.responseCode >= 200 && log.responseCode < 300).length;
    let webhookFailCount = webhookData.length - webhookSuccessCount;

    // Calculate the percentage success rate
    let apiSuccessRate = ((apiSuccessCount / (apiSuccessCount + apiFailCount)) * 100).toFixed(2);
    let webhookSuccessRate = ((webhookSuccessCount / (webhookSuccessCount + webhookFailCount)) * 100).toFixed(2);

    // Update the health summary text content for API Requests
    const apiRequestsItem = document.querySelector('#viz2 .api-summary-item:first-child .api-summary-info');
    apiRequestsItem.querySelector('.success').textContent = `Success: ${apiSuccessCount}`;
    apiRequestsItem.querySelector('.fail').textContent = `Fail: ${apiFailCount}`;
    apiRequestsItem.querySelector('.success-rate').textContent = `${apiSuccessRate}% success`;

    // Update the health summary text content for Webhooks Sent
    const webhooksItem = document.querySelector('#viz2 .api-summary-item:last-child .api-summary-info');
    webhooksItem.querySelector('.success').textContent = `Success: ${webhookSuccessCount}`;
    webhooksItem.querySelector('.fail').textContent = `Fail: ${webhookFailCount}`;
    webhooksItem.querySelector('.success-rate').textContent = `${webhookSuccessRate}% success`;
}

// Update the record count for specified table
function updateRecordCount(tableId) {
    const table = document.getElementById(tableId);
    const totalRecordsId = tableId === 'apiRequestTable' ? 'totalApiRecords' : 'totalWebhookRecords';
    const totalRecordsSpan = document.getElementById(totalRecordsId);
    const visibleRows = Array.from(table.querySelectorAll('tbody tr')).filter(row => row.style.display !== 'none').length;
    totalRecordsSpan.textContent = visibleRows;
}

// Filter table and update record count
function filterTable(input, columnIndex) {
    const filterText = input.value.toUpperCase();
    const table = input.closest('table');
    const rows = table.getElementsByTagName('tbody')[0].rows;

    for (let i = 0; i < rows.length; i++) {
        let cell = rows[i].cells[columnIndex];
        if (cell) {
            let text = cell.textContent || cell.innerText;
            if (text.toUpperCase().indexOf(filterText) > -1) {
                rows[i].style.display = "";
            } else {
                rows[i].style.display = "none";
            }
        }
    }
    updateRecordCount(table.id); // Pass the ID of the table to update the correct count
}

// Visualization updates as before but call updateRecordCount for the appropriate table
function updateVisualization3(data) {
    const admins = JSON.parse(localStorage.getItem('MerakiAdmins')) || [];
    const adminMap = new Map(admins.map(admin => [admin.id, admin]));
    const tbody = document.querySelector('#apiRequestTable tbody');

    tbody.innerHTML = data.map(request => {
        const admin = adminMap.get(request.adminId) || {};
        return `
            <tr>
                <td>${request.ts}</td>
                <td>${admin.name || 'Unknown'} (${admin.email || 'No email'})</td>
                <td>${request.operationId}</td>
                <td>${request.sourceIp}</td>
                <td>${request.responseCode}</td>
                <td>${request.userAgent}</td>
            </tr>
        `;
    }).join('');
    updateRecordCount('apiRequestTable');
}

function updateVisualization4(data) {
    const tbody = document.querySelector('#webhookLogsTable tbody');  // Ensure you have an id for your webhook table

    tbody.innerHTML = data.map(log => `
        <tr>
            <td>${new Date(log.loggedAt).toLocaleString()}</td>
            <td>${log.networkId}</td>
            <td>${log.organizationId}</td>     
            <td>${log.responseCode}</td>
            <td>${log.responseDuration}</td>
            <td>${log.url}</td>
        </tr>
    `).join('');
    updateRecordCount('webhookLogsTable');
}

// API Request Analysis
function updateApiRequestAnalysis(allApiResponseData) {
    const getTopEntry = (data) => Object.entries(data)
        .sort((a, b) => b[1] - a[1])[0] || ["None", 0];

    const truncateUserAgent = (userAgent) => userAgent.length > 20 ? userAgent.substring(0, 20) + '...' : userAgent;

    // Initialize counts objects for successes and failures
    const userAgentsSuccess = {};
    const userAgentsFails = {};
    const operationsSuccess = {};
    const operationsFails = {};
    const ipAddressesSuccess = {};
    const ipAddressesFails = {};
    const adminIdsSuccess = {};
    const adminIdsFails = {};
    const daysSuccess = {};
    const daysFails = {};
    const hoursCountSuccess = {};
    const hoursCountFails = {};

    if (!Array.isArray(allApiResponseData)) {
        console.error('allApiResponseData is not an array', allApiResponseData);
        return;
    }

    allApiResponseData.forEach(entry => {
        const date = new Date(entry.ts);
        const day = date.toLocaleDateString('en-US', { weekday: 'long' });
        const timeFrameKey = `${date.getUTCHours()}:00 - ${(date.getUTCHours() + 1) % 24}:00`;

        // Categorize data by success and fail based on the response code
        const isSuccess = entry.responseCode >= 200 && entry.responseCode < 300;
        const operations = isSuccess ? operationsSuccess : operationsFails;
        const ipAddresses = isSuccess ? ipAddressesSuccess : ipAddressesFails;
        const adminIds = isSuccess ? adminIdsSuccess : adminIdsFails;
        const days = isSuccess ? daysSuccess : daysFails;
        const hoursCount = isSuccess ? hoursCountSuccess : hoursCountFails;

        operations[entry.operationId] = (operations[entry.operationId] || 0) + 1;
        ipAddresses[entry.sourceIp] = (ipAddresses[entry.sourceIp] || 0) + 1;
        adminIds[entry.adminId] = (adminIds[entry.adminId] || 0) + 1;
        days[day] = (days[day] || 0) + 1;
        hoursCount[timeFrameKey] = (hoursCount[timeFrameKey] || 0) + 1;

        const userAgents = isSuccess ? userAgentsSuccess : userAgentsFails;
        userAgents[entry.userAgent] = (userAgents[entry.userAgent] || 0) + 1;
    });

    const adminDetails = JSON.parse(localStorage.getItem('MerakiAdmins'))

    const formatAdminDetails = (adminId) => {
        // Find the admin object by ID
        const details = adminDetails.find(admin => admin.id === adminId);
        // console.log("admin details", details);
        return details ? `${details.name}, ${details.email}` : 'Admin details not found';
    };

    // Find top entries
    const [topUserAgentSuccess, topUserAgentSuccessCount] = getTopEntry(userAgentsSuccess);
    const [topUserAgentFails, topUserAgentFailsCount] = getTopEntry(userAgentsFails);
    const [topOperationSuccess, topOperationSuccessCount] = getTopEntry(operationsSuccess);
    const [topOperationFails, topOperationFailsCount] = getTopEntry(operationsFails);
    const [topIpAddressSuccess, topIpAddressSuccessCount] = getTopEntry(ipAddressesSuccess);
    const [topIpAddressFails, topIpAddressFailsCount] = getTopEntry(ipAddressesFails);
    const [topAdminIdSuccess, topAdminIdSuccessCount] = getTopEntry(adminIdsSuccess);
    const [topAdminIdFails, topAdminIdFailsCount] = getTopEntry(adminIdsFails);
    const [busiestDaySuccess, busiestDaySuccessCount] = getTopEntry(daysSuccess);
    const [busiestDayFails, busiestDayFailsCount] = getTopEntry(daysFails);
    const [busiestTimeFrameSuccess, busiestTimeFrameSuccessCount] = getTopEntry(hoursCountSuccess);
    const [busiestTimeFrameFails, busiestTimeFrameFailsCount] = getTopEntry(hoursCountFails);

    // Update the DOM elements with new data
    document.getElementById('topUserAgentSuccess').textContent = truncateUserAgent(topUserAgentSuccess) + ' (' + topUserAgentSuccessCount + ')';
    document.getElementById('topUserAgentFails').textContent = truncateUserAgent(topUserAgentFails) + ' (' + topUserAgentFailsCount + ')';
    document.getElementById('topOperationSuccess').textContent = topOperationSuccess + ' (' + topOperationSuccessCount + ')';
    document.getElementById('topOperationFails').textContent = topOperationFails + ' (' + topOperationFailsCount + ')';
    document.getElementById('topIpAddressSuccess').textContent = topIpAddressSuccess + ' (' + topIpAddressSuccessCount + ' requests)';
    document.getElementById('topIpAddressFails').textContent = topIpAddressFails + ' (' + topIpAddressFailsCount + ' requests)';
    document.getElementById('topAdminIdSuccess').textContent = topAdminIdSuccess + ' (' + topAdminIdSuccessCount + ' actions)';
    document.getElementById('topAdminIdFails').textContent = topAdminIdFails + ' (' + topAdminIdFailsCount + ' actions)';
    document.getElementById('busiestDaySuccess').textContent = busiestDaySuccess + ' (' + busiestDaySuccessCount + ' requests)';
    document.getElementById('busiestDayFails').textContent = busiestDayFails + ' (' + busiestDayFailsCount + ' requests)';
    document.getElementById('busiestTimeFrameSuccess').textContent = busiestTimeFrameSuccess + ' (' + busiestTimeFrameSuccessCount + ' requests)';
    document.getElementById('busiestTimeFrameFails').textContent = busiestTimeFrameFails + ' (' + busiestTimeFrameFailsCount + ' requests)';

    // admin info
    document.getElementById('topAdminSuccessDetails').textContent = formatAdminDetails(getTopEntry(adminIdsSuccess)[0]);
    document.getElementById('topAdminFailsDetails').textContent = formatAdminDetails(getTopEntry(adminIdsFails)[0]);
}

// Webhook Analysis
function updateWebhookLogAnalysis(allWebhookData) {
    // Initialize counts for successes and failures
    let urlCountsSuccess = {};
    let urlCountsFailure = {};
    let networkIdCountsSuccess = {};
    let networkIdCountsFailure = {};
    let responseTimesSuccess = [];
    let dayCounts = { success: {}, failure: {} };
    let timeFrameCounts = { success: {}, failure: {} };

    // Process each webhook log entry
    allWebhookData.forEach(log => {
        const date = new Date(log.loggedAt);
        const day = date.toLocaleDateString('en-US', { weekday: 'long' });
        const hour = date.getHours();
        const timeFrame = `${hour}:00 - ${(hour + 1) % 24}:00`;
        const isSuccess = log.responseCode >= 200 && log.responseCode < 300;
        const statusCategory = isSuccess ? 'success' : 'failure';

        // Increment counts for URL and network ID
        if (isSuccess) {
            urlCountsSuccess[log.url] = (urlCountsSuccess[log.url] || 0) + 1;
            networkIdCountsSuccess[log.networkId] = (networkIdCountsSuccess[log.networkId] || 0) + 1;
            responseTimesSuccess.push(log.responseDuration);
        } else {
            urlCountsFailure[log.url] = (urlCountsFailure[log.url] || 0) + 1;
            networkIdCountsFailure[log.networkId] = (networkIdCountsFailure[log.networkId] || 0) + 1;
        }

        // Increment counts for day and time frame
        dayCounts[statusCategory][day] = (dayCounts[statusCategory][day] || 0) + 1;
        timeFrameCounts[statusCategory][timeFrame] = (timeFrameCounts[statusCategory][timeFrame] || 0) + 1;
    });

    // Helper function to find the top entry in a dictionary
    const getTopEntry = (data) => Object.entries(data).sort((a, b) => b[1] - a[1])[0] || ["None", 0];

    // Calculate the lowest response time for successful responses
    const lowestResponseTimeSuccess = responseTimesSuccess.length > 0
        ? Math.min(...responseTimesSuccess)
        : 'N/A';

    // Update the success stats in the DOM
    document.getElementById('webhookTopUrl').textContent = getTopEntry(urlCountsSuccess)[0];
    document.getElementById('webhookTopNetworkId').textContent = getTopEntry(networkIdCountsSuccess)[0];
    document.getElementById('webhookLowestResponseTime').textContent = `${lowestResponseTimeSuccess} ms`;
    document.getElementById('webhookBusiestDaySuccess').textContent = getTopEntry(dayCounts.success)[0];
    document.getElementById('webhookBusiestTimeFrameSuccess').textContent = getTopEntry(timeFrameCounts.success)[0];

    // Update the failure stats in the DOM
    document.getElementById('webhookTopUrlFails').textContent = getTopEntry(urlCountsFailure)[0];
    document.getElementById('webhookTopNetworkIdFail').textContent = getTopEntry(networkIdCountsFailure)[0];
    document.getElementById('webhookLongestResponseTime').textContent = `${getTopEntry(responseTimesSuccess)[1]} ms`;
    // Peak response time for failures is not meaningful if failure is due to timeout (-1 response codes),
    // so it's not updated here. Add this if you have a better definition of "peak response time" for failures.
    document.getElementById('webhookBusiestDayFails').textContent = getTopEntry(dayCounts.failure)[0];
    document.getElementById('webhookBusiestTimeFrameFails').textContent = getTopEntry(timeFrameCounts.failure)[0];

    // Update the total records count
    document.getElementById('totalWebhookRecords').textContent = allWebhookData.length.toString();
}


// Start the application
init();



























