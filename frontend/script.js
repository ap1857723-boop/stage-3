const API_BASE_URL = 'http://127.0.0.1:8000';

let layoutData = {};
let layoutMeta = { rows: 10, seats_per_row: 7 };
let selectedForBooking = [];
const rowLetters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T'];
let currentShowId = null;
let currentShowName = "";
let showsList = [];
let currentRegPrice = 10;
let currentVipPrice = 20;

let currentUser = null;
let authToken = null;
let isRegisterMode = false;
let pollingInterval = null;

document.addEventListener('DOMContentLoaded', () => {
    checkAuthState();
    fetchShows();
    
    document.getElementById('showSelect').addEventListener('change', (e) => {
        currentShowId = e.target.value;
        if(e.target.selectedIndex > 0) {
            currentShowName = e.target.options[e.target.selectedIndex].text;
            const s = showsList.find(x => x.id == currentShowId);
            if(s) {
                currentRegPrice = s.regular_price;
                currentVipPrice = s.vip_price;
                // Render Cinematic Graphics dynamically
                const bg = document.getElementById('bgArtwork');
                bg.style.backgroundImage = `url('${s.image_url}')`;
                bg.style.opacity = '0.15';
                
                const mInfo = document.getElementById('movieInfoPanel');
                mInfo.style.display = 'flex';
                document.getElementById('moviePoster').src = s.image_url;
                document.getElementById('movieTitle').innerText = s.title;
                document.getElementById('movieDesc').innerText = s.description;
            }
            document.getElementById('legendRegPrice').innerText = `Regular (₹${currentRegPrice})`;
            document.getElementById('legendVipPrice').innerText = `VIP (₹${currentVipPrice})`;
        } else {
            currentShowName = "";
            document.getElementById('legendRegPrice').innerText = `Regular`;
            document.getElementById('legendVipPrice').innerText = `VIP`;
            document.getElementById('bgArtwork').style.opacity = '0';
            document.getElementById('movieInfoPanel').style.display = 'none';
        }
        
        selectedForBooking = [];
        updatePanel();
        if(pollingInterval) clearInterval(pollingInterval);
        
        if(currentShowId) {
            fetchLayout();
            pollingInterval = setInterval(fetchLayoutSilently, 3000);
        }
        else {
            document.getElementById('seatingGrid').innerHTML = '<div class="loader">Select an experience...</div>';
        }
    });

    document.getElementById('checkoutBtn').addEventListener('click', initiateCheckout);
    document.getElementById('paymentForm').addEventListener('submit', processPaymentIntegration);
});


// --- AUTH LOGIC ---
function checkAuthState() {
    authToken = localStorage.getItem('cinemax_token');
    const role = localStorage.getItem('cinemax_role');
    const uname = localStorage.getItem('cinemax_uname');
    
    if(authToken) {
        currentUser = { token: authToken, role, username: uname };
        let adminBtn = role === 'admin' ? `<a href="admin.html" class="btn btn-primary btn-sm" style="text-decoration:none;">⚙️ Dash</a>` : '';
        document.getElementById('authBar').innerHTML = `
            ${adminBtn} 
            <button class="btn btn-secondary btn-sm" onclick="openProfile()">👤 Profile</button>
            <button class="btn btn-secondary btn-sm" onclick="openUserTickets()">🎟️ My Tickets</button>
            <button class="btn btn-secondary btn-sm" onclick="logout()">Log Out</button>
        `;
        const wmsg = document.getElementById('welcomeMessage');
        wmsg.innerText = `Welcome back, ${uname}!`;
        wmsg.style.display = 'block';
    } else {
        currentUser = null;
        document.getElementById('authBar').innerHTML = `<button class="btn btn-secondary btn-sm" onclick="showLogin()">🔑 Login / Signup</button>`;
        document.getElementById('welcomeMessage').style.display = 'none';
    }
}

function showLogin() {
    isRegisterMode = false;
    document.getElementById('authError').style.display = 'none';
    document.getElementById('emailGroup').style.display = 'none';
    const ext = document.getElementById('extendedRegFields');
    if(ext) ext.style.display = 'none';
    document.getElementById('loginActionButton').innerText = 'Login';
    document.getElementById('toggleRegBtn').innerText = 'Switch to Register';
    document.getElementById('loginForm').onsubmit = handleLogin;
    document.getElementById('loginModal').classList.add('active');
}

function toggleRegister() {
    isRegisterMode = !isRegisterMode;
    if(isRegisterMode) {
        document.getElementById('emailGroup').style.display = 'block';
        const ext = document.getElementById('extendedRegFields');
        if(ext) ext.style.display = 'block';
        document.getElementById('loginActionButton').innerText = 'Complete Registration';
        document.getElementById('toggleRegBtn').innerText = 'Switch to Login';
        document.getElementById('loginForm').onsubmit = registerUser;
    } else {
        showLogin();
    }
}

async function handleLogin(e) {
    e.preventDefault();
    const uname = document.getElementById('username').value;
    const pass = document.getElementById('password').value;
    document.getElementById('loginActionButton').innerText = 'Authenticating...';
    try {
        const res = await fetch(`${API_BASE_URL}/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: uname, password: pass }) });
        const data = await res.json();
        if(res.ok) {
            localStorage.setItem('cinemax_token', data.token); localStorage.setItem('cinemax_role', data.role); localStorage.setItem('cinemax_uname', data.username);
            closeModal('loginModal'); showNotification('Logged in!', 'success'); checkAuthState();
        } else {
            document.getElementById('authError').innerText = data.detail || 'Login failed';
            document.getElementById('authError').style.display = 'block';
            document.getElementById('loginActionButton').innerText = 'Login';
        }
    } catch(err) {
        document.getElementById('authError').innerText = 'Network error'; document.getElementById('authError').style.display = 'block'; document.getElementById('loginActionButton').innerText = 'Login';
    }
}

async function registerUser(e) {
    e.preventDefault();
    const uname = document.getElementById('username').value; 
    const pass = document.getElementById('password').value; 
    const email = document.getElementById('email').value;
    const fullName = document.getElementById('regFullName')?.value;
    const phone = document.getElementById('regPhone')?.value;
    const address = document.getElementById('regAddress')?.value;

    document.getElementById('loginActionButton').innerText = 'Creating Profile...';
    try {
        const payload = { username: uname, password: pass, email: email, full_name: fullName, phone_number: phone, address: address };
        const res = await fetch(`${API_BASE_URL}/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if(res.ok) { showNotification('Registered!', 'success'); handleLogin(e); } 
        else {
            const data = await res.json();
            document.getElementById('authError').innerText = data.detail; document.getElementById('authError').style.display = 'block'; document.getElementById('loginActionButton').innerText = 'Registration';
        }
    } catch(err) { document.getElementById('authError').innerText = 'Network Error'; document.getElementById('authError').style.display = 'block'; }
}

function logout() {
    localStorage.removeItem('cinemax_token'); localStorage.removeItem('cinemax_role'); localStorage.removeItem('cinemax_uname');
    checkAuthState(); showNotification('Logged out', 'success');
}

// --- USER TICKETS & PROFILE PORTAL ---
async function openProfile() {
    document.getElementById('profileModal').classList.add('active');
    document.getElementById('profSaveBtn').innerText = 'Loading...';
    try {
        const res = await fetch(`${API_BASE_URL}/user/profile`, { headers: { 'Authorization': `Bearer ${currentUser.token}` } });
        const data = await res.json();
        if(res.ok) {
            document.getElementById('profUsername').value = data.username || '';
            document.getElementById('profEmail').value = data.email || '';
            document.getElementById('profFullName').value = data.full_name || '';
            document.getElementById('profPhone').value = data.phone_number || '';
            document.getElementById('profAddress').value = data.address || '';
        }
    } catch(e) { showNotification('Failed to fetch profile', 'error'); }
    document.getElementById('profSaveBtn').innerText = 'Save Changes';

    document.getElementById('profileForm').onsubmit = async (e) => {
        e.preventDefault();
        const btn = document.getElementById('profSaveBtn'); btn.innerText = 'Saving...'; btn.disabled = true;
        try {
            const payload = {
                full_name: document.getElementById('profFullName').value,
                phone_number: document.getElementById('profPhone').value,
                address: document.getElementById('profAddress').value
            };
            const updateRes = await fetch(`${API_BASE_URL}/user/profile`, { 
                method: 'PUT', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentUser.token}` }, 
                body: JSON.stringify(payload) 
            });
            if(updateRes.ok) showNotification('Profile updated successfully!', 'success');
        } catch(err) { showNotification('Could not save profile', 'error'); }
        btn.innerText = 'Save Changes'; btn.disabled = false;
    };
}

async function openUserTickets() {
    document.getElementById('userTicketsModal').classList.add('active');
    const tbody = document.getElementById('userTicketsBody');
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Fetching history...</td></tr>';
    
    try {
        const res = await fetch(`${API_BASE_URL}/user/bookings`, { headers: { 'Authorization': `Bearer ${currentUser.token}` } });
        const data = await res.json();
        
        if (data.bookings.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text-muted)">No bookings found. Time to grab popcorn!</td></tr>';
            return;
        }
        
        tbody.innerHTML = '';
        data.bookings.forEach(b => {
             const tr = document.createElement('tr');
             tr.innerHTML = `
                 <td><span class="seat-badge" style="background:#8b5cf6;">TKT-${b.booking_id}</span></td>
                 <td style="display:flex;align-items:center;gap:0.5rem;"><img src="${b.image_url}" style="width:30px;height:45px;border-radius:4px;object-fit:cover;"> <div><strong>${b.title}</strong><div style="font-size:0.75rem;color:var(--text-muted);">${b.time}</div></div></td>
                 <td><span class="seat-badge">${rowLetters[b.row_number]}${b.seat_number}</span></td>
                 <td style="font-size:0.85rem;color:var(--text-muted);">${new Date(b.timestamp).toLocaleDateString()}</td>
             `;
             tbody.appendChild(tr);
        });
    } catch(e) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--danger)">Failed to load data.</td></tr>';
    }
}

// --- CORE ---
async function fetchShows() {
    try {
        const response = await fetch(`${API_BASE_URL}/shows`);
        const data = await response.json();
        showsList = data.shows;
        const select = document.getElementById('showSelect');
        select.innerHTML = '<option value="">-- Choose a Show --</option>';
        showsList.forEach(show => {
            const opt = document.createElement('option'); opt.value = show.id; opt.innerText = `${show.title} - ${show.time}`; select.appendChild(opt);
        });
    } catch (e) { showNotification('Failed to load shows', 'error'); }
}

async function fetchLayout() {
    if (!currentShowId) return;
    try {
        const response = await fetch(`${API_BASE_URL}/seats/layout?show_id=${currentShowId}`);
        const data = await response.json();
        layoutData = data.layout; layoutMeta.rows = data.rows; layoutMeta.seats_per_row = data.seats_per_row;
        renderSeatingArea();
    } catch (error) { showNotification('Error fetching', 'error'); }
}

async function fetchLayoutSilently() {
    if (!currentShowId) return;
    try {
        const response = await fetch(`${API_BASE_URL}/seats/layout?show_id=${currentShowId}`);
        if(!response.ok) return;
        const data = await response.json();
        layoutData = data.layout; 
        updateSeatDOM();
    } catch (error) { }
}

function updateSeatDOM() {
    for (let i = 0; i < layoutMeta.rows; i++) {
        const rowData = layoutData[i] || [];
        for (let j = 1; j <= layoutMeta.seats_per_row; j++) {
            const seatInfo = rowData.find(s => s.seat_number === j) || { status: 'available' };
            const seatEl = document.querySelector(`.seat[data-row="${i}"][data-seat="${j}"]`);
            if (seatEl) {
                const isSelectedByUs = selectedForBooking.some(s => s.row_number === i && s.seat_number === j);
                if (seatInfo.status !== seatEl.dataset.status) {
                    if (isSelectedByUs && seatInfo.status !== 'available') {
                        seatEl.classList.remove('selected');
                        const index = selectedForBooking.findIndex(s => s.row_number === i && s.seat_number === j);
                        if(index > -1) selectedForBooking.splice(index, 1);
                        showNotification("A seat you selected was just reserved by another person!", "error");
                        updatePanel();
                    }
                    
                    const isVip = i >= (layoutMeta.rows - 2);
                    seatEl.className = `seat ${seatInfo.status} ${isVip ? 'vip' : ''}`;
                    if (isSelectedByUs && seatInfo.status === 'available') {
                         seatEl.classList.add('selected');
                    }
                    seatEl.dataset.status = seatInfo.status;
                }
            }
        }
    }
}

function renderSeatingArea() {
    const grid = document.getElementById('seatingGrid'); grid.innerHTML = '';
    for (let i = 0; i < layoutMeta.rows; i++) {
        const rowData = layoutData[i] || [];
        const isVip = i >= (layoutMeta.rows - 2); 
        const rowEl = document.createElement('div'); rowEl.className = 'row';
        const labelEl = document.createElement('div'); labelEl.className = 'row-label'; labelEl.innerText = rowLetters[i] || `${i}`; rowEl.appendChild(labelEl);
        const seatsContainer = document.createElement('div'); seatsContainer.className = 'seats-container';

        for (let j = 1; j <= layoutMeta.seats_per_row; j++) {
            const seatInfo = rowData.find(s => s.seat_number === j) || { status: 'available' };
            const seatEl = document.createElement('div');
            seatEl.className = `seat ${seatInfo.status} ${isVip ? 'vip' : ''}`; seatEl.innerText = j;
            seatEl.dataset.row = i; seatEl.dataset.seat = j; seatEl.dataset.status = seatInfo.status; seatEl.dataset.price = isVip ? currentVipPrice : currentRegPrice;
            
            // Theatre layout: Center vertical aisle space
            if (layoutMeta.seats_per_row >= 8 && j === Math.floor(layoutMeta.seats_per_row / 2)) {
                seatEl.style.marginRight = '2.5rem';
            }
            
            if(seatInfo.status === 'available') seatEl.addEventListener('click', toggleSeatSelection);
            seatsContainer.appendChild(seatEl);
        }
        
        // Theatre layout: Horizontal walking paths between sections
        if (layoutMeta.rows >= 5 && (i === layoutMeta.rows - 3 || i === Math.floor((layoutMeta.rows - 2) / 2) - 1)) {
            rowEl.style.marginBottom = '2.5rem';
        }
        
        rowEl.appendChild(seatsContainer); grid.appendChild(rowEl);
    }
    updatePanel();
}

function toggleSeatSelection(event) {
    if(!currentUser) { showLogin(); return; }
    const seatEl = event.target;
    if(seatEl.dataset.status !== 'available') return;
    const row = parseInt(seatEl.dataset.row); const seat = parseInt(seatEl.dataset.seat); const price = parseInt(seatEl.dataset.price);
    const index = selectedForBooking.findIndex(s => s.row_number === row && s.seat_number === seat);
    if (index > -1) { selectedForBooking.splice(index, 1); seatEl.classList.remove('selected'); } 
    else { selectedForBooking.push({ row_number: row, seat_number: seat, price }); seatEl.classList.add('selected'); }
    updatePanel();
}

function updatePanel() {
    const bookBtn = document.getElementById('checkoutBtn'); const seatsText = document.getElementById('selectedSeatsText'); const priceText = document.getElementById('totalPriceText');
    if(!document.getElementById('checkoutModal').classList.contains('active')) {
        bookBtn.disabled = selectedForBooking.length === 0;
    }
    if (selectedForBooking.length === 0) { seatsText.innerText = 'None'; priceText.innerText = 'Total: ₹0'; } 
    else {
        seatsText.innerText = selectedForBooking.map(s => rowLetters[s.row_number] + s.seat_number).join(', ');
        const total = selectedForBooking.reduce((acc, curr) => acc + curr.price, 0); priceText.innerText = `Total: ₹${total}`;
    }
}

async function initiateCheckout() {
    if(selectedForBooking.length === 0) return;
    if(!currentUser) { showLogin(); return; }
    document.getElementById('checkoutBtn').innerText = 'Locking...';
    try {
        const res = await fetch(`${API_BASE_URL}/seats/lock`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentUser.token}` }, body: JSON.stringify({ show_id: parseInt(currentShowId), seats: selectedForBooking }) });
        if(!res.ok) {
            const err = await res.json(); showNotification(err.detail, 'error'); document.getElementById('checkoutBtn').innerText = 'Proceed'; fetchLayout(); selectedForBooking = []; return;
        }
    } catch(e) { showNotification('Network disconnected', 'error'); return; }

    let summaryHtml = `<div style="display:flex; justify-content:space-between; margin-bottom:0.5rem;"><p>Movie:</p> <p><strong>${currentShowName}</strong></p></div>`;
    summaryHtml += `<div style="display:flex; justify-content:space-between; margin-bottom:0.5rem;"><p>Seats Secured:</p> <p><strong>${selectedForBooking.map(s => rowLetters[s.row_number] + s.seat_number).join(', ')}</strong></p></div>`;
    const total = selectedForBooking.reduce((acc, curr) => acc + curr.price, 0);
    summaryHtml += `<hr style="border-color:#334155; margin: 10px 0;"><p style="margin-top:0.5rem;font-size:1.1rem;color:#22c55e;">Amount Due: <strong>₹${total}</strong></p>`;
    
    document.getElementById('checkoutSummary').innerHTML = summaryHtml;
    document.getElementById('cardName').value = currentUser.username; document.getElementById('cardNumber').value = ''; document.getElementById('cardExp').value = ''; document.getElementById('cardCvc').value = '';
    
    document.getElementById('checkoutModal').classList.add('active');
    document.getElementById('checkoutBtn').innerText = 'Proceed to Secure Checkout';
    selectedForBooking.forEach(s => { const sel = document.querySelector(`.seat[data-row="${s.row_number}"][data-seat="${s.seat_number}"]`); if(sel) { sel.classList.remove('selected'); sel.classList.add('locked'); sel.dataset.status='locked'; }});
}

async function cancelCheckout() {
    closeModal('checkoutModal');
    await fetch(`${API_BASE_URL}/seats/unlock`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentUser.token}` }, body: JSON.stringify({ show_id: parseInt(currentShowId), seats: selectedForBooking }) });
    selectedForBooking = []; showNotification('Cart Emptied', 'success'); fetchLayout();
}

async function processPaymentIntegration(e) {
    e.preventDefault();
    const btn = document.getElementById('confirmPaymentBtn'); btn.disabled = true; btn.innerText = 'Authenticating...';
    try {
        const intentRes = await fetch(`${API_BASE_URL}/create-payment-intent`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentUser.token}` }, body: JSON.stringify({ show_id: parseInt(currentShowId), seats: selectedForBooking }) });
        if (!intentRes.ok) throw new Error('Payment rejected');
        const intentData = await intentRes.json();
        
        btn.innerText = 'Validating External Card...';
        await new Promise(r => setTimeout(r, 1500));
        
        btn.innerText = 'Routing Email Confirmation...';
        const res = await fetch(`${API_BASE_URL}/seats/book`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentUser.token}` }, body: JSON.stringify({ show_id: parseInt(currentShowId), seats: selectedForBooking }) });
        
        if (res.ok) { closeModal('checkoutModal'); showReceipt(); } 
        else { const err = await res.json(); showNotification(err.detail, 'error'); closeModal('checkoutModal'); }
    } catch (error) { showNotification('Gateway drop.', 'error'); cancelCheckout(); }
    
    btn.disabled = false; btn.innerText = 'Confirm & Pay'; selectedForBooking = []; fetchLayout(); updatePanel();
}

function showReceipt() {
    const total = selectedForBooking.reduce((acc, curr) => acc + curr.price, 0); // Oops, selectedForBooking gets wiped later, wait, it's wiped inside processPaymentIntegration exactly after showReceipt is evaluated, so it's fine! 
    const html = `
        <div style="text-align:center; padding:1.5rem; background:rgba(34, 197, 94, 0.1); border:1px solid rgba(34, 197, 94, 0.3); border-radius:8px; margin-bottom: 1.5rem;">
            <strong style="color:var(--text-main);font-size:1.2rem;">Receipt sent securely to</strong><br>
            <span style="color:#60a5fa">${currentUser.username}@test.com</span>
        </div>
        <p style="font-size:0.9rem; color:var(--text-muted); margin-bottom: 2rem;">If this were production, a pristine HTML email containing your Seat Map layout would instantly be visible in your real email box securely dispatched through Python GMAIL SMTP modules natively!</p>
        <div style="font-size:1rem; color:#22c55e"><strong>Total Billed to Stripe: </strong>₹${total}.00</div>
    `;
    
    document.getElementById('receiptDetails').innerHTML = html;
    document.getElementById('receiptModal').classList.add('active');
}

function closeModal(id) { document.getElementById(id).classList.remove('active'); }
function showNotification(message, type) { const notif = document.getElementById('notification'); notif.innerText = message; notif.className = `notification ${type} show`; setTimeout(() => { notif.classList.remove('show'); }, 3500); }
