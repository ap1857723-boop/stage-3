const API_BASE_URL = 'http://127.0.0.1:8000';
const rowLetters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T'];

document.addEventListener('DOMContentLoaded', () => { checkAdminAuth(); });

function checkAdminAuth() {
    const token = localStorage.getItem('cinemax_token');
    const role = localStorage.getItem('cinemax_role');
    
    if(!token || role !== 'admin') {
        alert("ACCESS DENIED: Extremely sensitive Admin Dashbaord.\nYou must Quick Register as 'admin' to utilize permissions."); window.location.href = 'index.html'; return;
    }
    fetchShowsList();
    fetchBookings();
    fetchAnalytics();
}

function getAuthHeaders() { return { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('cinemax_token')}` }; }

// ----------------- ANALYTICS AGGREGATION -----------------
async function fetchAnalytics() {
    try {
        const res = await fetch(`${API_BASE_URL}/admin/analytics`, { headers: getAuthHeaders() });
        const data = await res.json();
        if(res.ok) {
            document.getElementById('statRev').innerText = `₹${data.total_revenue}`;
            document.getElementById('statSold').innerText = data.tickets_sold;
            document.getElementById('statPop').innerText = data.popular_movie.substring(0, 30);
        }
    } catch(e) { console.error(e); }
}

// ----------------- SHOW LIST ADMIN FUNCTIONS -----------------
async function fetchShowsList() {
    try {
        const response = await fetch(`${API_BASE_URL}/shows`);
        const data = await response.json();
        renderShowsTable(data.shows);
    } catch (e) { showNotification('Failed to fetch running shows', 'error'); }
}

function renderShowsTable(shows) {
    const tbody = document.getElementById('showsTableBody'); tbody.innerHTML = '';
    if (shows.length === 0) { tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-muted)">No active shows running.</td></tr>'; return; }

    shows.forEach(s => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><img src="${s.image_url}" style="width:45px; height:65px; object-fit:cover; border-radius:6px; box-shadow:0 2px 5px rgba(0,0,0,0.5);"></td>
            <td><strong>${s.title}</strong><div style="font-size:0.8rem;color:var(--text-muted);">${s.time}</div></td>
            <td>Grid: ${s.rows}x${s.seats_per_row}</td>
            <td>R: ₹${s.regular_price} <br> V: ₹${s.vip_price}</td>
            <td><button class="btn btn-danger btn-sm" onclick="deleteShow(${s.id}, '${s.title.replace(/'/g, "\\'")}')">Obliterate</button></td>
        `;
        tbody.appendChild(tr);
    });
}

async function deleteShow(showId, showTitle) {
    if (!confirm(`CRITICAL WARNING:\nAre you entirely sure you want to PERMANENTLY erase "${showTitle}"?\n\nThis wipes all active reservations mapped functionally to this structural showing!`)) return;
    try {
        const res = await fetch(`${API_BASE_URL}/admin/shows/${showId}`, { method: 'DELETE', headers: getAuthHeaders() });
        if(res.ok) {
            showNotification(`The showing was successfully wiped from memory.`, 'success');
            fetchShowsList(); fetchBookings(); fetchAnalytics();
        } else showNotification('Failed to destruct records.', 'error');
    } catch(e) { showNotification('Network exception destroying mapping records', 'error'); }
}

// ----------------- BOOKINGS LOG LIST -----------------
async function fetchBookings() {
    try {
        const response = await fetch(`${API_BASE_URL}/admin/bookings`, { headers: getAuthHeaders() });
        if(!response.ok) throw new Error("Unauthorized");
        const data = await response.json();
        renderTable(data.bookings);
    } catch (error) { showNotification('Authorization Failed', 'error'); }
}

function renderTable(bookings) {
    const tbody = document.getElementById('bookingsTableBody'); tbody.innerHTML = '';
    if (bookings.length === 0) { tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-muted)">No bookings tracking metadata found.</td></tr>'; return; }

    bookings.forEach(b => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>#${b.booking_id}</td>
            <td><strong>${b.username}</strong><br><small style="color:var(--text-muted)">${b.email}</small></td>
            <td><div>${b.title}</div><small style="color:var(--text-muted)">${b.time}</small></td>
            <td><span class="seat-badge">${rowLetters[b.row_number]}${b.seat_number}</span></td>
            <td><button class="btn btn-secondary btn-sm" onclick="cancelAdminBooking(${b.show_id}, ${b.row_number}, ${b.seat_number})">Void Seat</button></td>
        `;
        tbody.appendChild(tr);
    });
}

async function cancelAdminBooking(showId, row, seat) {
    if (!confirm(`Void seat ${rowLetters[row]}${seat} securely?`)) return;
    try {
        const res = await fetch(`${API_BASE_URL}/admin/cancel`, { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify({ show_id: showId, row_number: row, seat_number: seat }) });
        if (res.ok) { showNotification('Reverted natively.', 'success'); fetchBookings(); fetchAnalytics(); } 
        else { const err = await res.json(); showNotification(err.detail || 'Failed to cancel', 'error'); }
    } catch (e) { showNotification('Network error', 'error'); }
}

// --- CONFIGURATION HOOKS ---
document.getElementById('addShowForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('addShowBtn'); btn.disabled = true; btn.innerText = 'Structuring...';

    const title = document.getElementById('newShowTitle').value; const time = document.getElementById('newShowTime').value;
    const regPrice = parseInt(document.getElementById('newRegPrice').value) || 10; const vipPrice = parseInt(document.getElementById('newVipPrice').value) || 20;
    const poster = document.getElementById('newPoster').value; const desc = document.getElementById('newDesc').value;

    try {
        const res = await fetch(`${API_BASE_URL}/admin/shows`, {
            method: 'POST', headers: getAuthHeaders(),
            body: JSON.stringify({ title: title, time: time, regular_price: regPrice, vip_price: vipPrice, rows: 12, seats_per_row: 10, image_url: poster, description: desc })
        });
        if (res.ok) {
            showNotification('New show deployed and musically seeded!', 'success');
            document.getElementById('addShowForm').reset();
            fetchShowsList(); 
        } else showNotification('Admin constraints block.', 'error');
    } catch (err) { showNotification('Network exception...', 'error'); }
    
    btn.disabled = false; btn.innerText = 'Initialize System';
});

function showNotification(message, type) { const notif = document.getElementById('notification'); notif.innerText = message; notif.className = `notification ${type} show`; setTimeout(() => { notif.classList.remove('show'); }, 3000); }
