// Global object to store product data from Loyverse API
let productsData = {}; 

// --- LOYVERSE API CONFIGURATION (Live Endpoints) ---
// Your unique AWS API Gateway URL for fetching inventory (GET)
const INVENTORY_API_URL = "https://0tfmpga1m9.execute-api.ap-south-1.amazonaws.com/prod/inventory";
// Your unique AWS API Gateway URL for submitting orders (POST)
const ORDER_SUBMIT_API_URL = "https://0tfmpga1m9.execute-api.ap-south-1.amazonaws.com/prod/submit-order";
// --------------------------------------------------

// Global variables for cart management
let cart = JSON.parse(localStorage.getItem('eazymartCart')) || [];
let promoCode = '';
let discount = 0;

// Fixed pickup location for EAZYMART cpt
const pickupLocation = { lat: 16.0962, lng: 80.1657 }; // Chilakaluripet, Guntur
const deliveryRadiusKm = 10; // 10 km delivery radius
const DELIVERY_FEE = 30; // Consistent with your order.html's original value

// Google Maps related global variables
let map;
let deliveryMarker;
let autocomplete;
let geocoder;
window.isGoogleMapsApiReady = false; // Flag to check if Maps API is loaded

// --- Common Page Initialization ---
document.addEventListener('DOMContentLoaded', function() {
    console.log("script.js: DOMContentLoaded fired. Running live API setup.");

    // Initialize tooltips (if Bootstrap is loaded)
    const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
    tooltipTriggerList.map(function (tooltipTriggerEl) {
        return new bootstrap.Tooltip(tooltipTriggerEl);
    });

    // Update cart badge on every page load
    updateCartBadge();
});

// --- Loyverse Integration (READ/Inventory Sync) ---

/**
 * Loads products from the Loyverse Sync API endpoint.
 */
window.loadProducts = function() {
    console.log("script.js: Fetching products from Loyverse API...");
    const menuItemsContainer = document.getElementById('menu-sections-container');
    if (!menuItemsContainer) return;

    // Show loading spinner
    menuItemsContainer.innerHTML = `
        <div id="loading-spinner" class="text-center py-5">
            <div class="spinner-border text-primary" role="status">
                <span class="visually-hidden">Loading...</span>
            </div>
            <p class="mt-3 text-muted">Connecting to EAZYMART inventory...</p>
        </div>
    `;

    fetch(INVENTORY_API_URL, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
    })
    .then(response => {
        if (!response.ok) {
            console.error(`HTTP Error: Status ${response.status}`);
            return response.json().catch(() => { throw new Error(`Network Error: Status ${response.status}. Check CORS/Deployment.`); });
        }
        return response.json();
    })
    .then(data => {
        if (data && data.body && typeof data.body === 'string') {
            try {
                productsData = JSON.parse(data.body);
            } catch (e) {
                console.error("Error parsing data.body:", e);
                productsData = data.body;
            }
        } else {
            productsData = data || {};
        }

        console.log("Products data fetched successfully:", Array.isArray(productsData) ? productsData.length : Object.keys(productsData).length, "items.");
        window.loadProductsToPage(); 
    })
    .catch(error => {
        console.error("Error fetching products from API:", error);
        menuItemsContainer.innerHTML = `
            <div class="alert alert-danger text-center" role="alert">
                <h4 class="alert-heading">Connection Failed! (CORS/Network)</h4>
                <p>We could not load inventory from the POS system. Please ensure the AWS API Gateway is configured correctly and CORS is enabled for http://www.cpteazymart.in.</p>
                <hr>
                <p class="mb-0">Error: ${error.message}</p>
            </div>
        `;
        if (typeof window.showToast === 'function') window.showToast("Failed to load products. Check console for API error.", 'danger', 5000);
    });
};

/**
 * Loads products from the global `productsData` object and renders them on the page.
 */
window.loadProductsToPage = function() {
    console.log("Rendering products to the page...");
    const menuItemsContainer = document.getElementById('menu-sections-container');
    if (!menuItemsContainer) return;

    menuItemsContainer.innerHTML = ''; 

    const categories = {
        'dry-fruits': { title: 'Dry Fruits & Nuts', items: [] },
        'snacks': { title: 'Snacks & Savouries', items: [] },
        'biscuits': { title: 'Chocolates & Biscuits', items: [] },
        'beverages': { title: 'Beverages', items: [] },
        'others': { title: 'Pantry & Essentials', items: [] },
    };

    if (Array.isArray(productsData)) {
        productsData.forEach((itm, idx) => {
            const key = itm.id || itm.handle || `item-${idx}`;
            productsData[key] = itm;
        });
    }

    Object.keys(productsData).forEach(itemId => {
        const item = productsData[itemId];
        if (!item || typeof item !== 'object') return;

        if (categories[item.category]) {
            categories[item.category].items.push({ ...item, id: itemId });
        } else {
             categories['others'].items.push({ ...item, id: itemId });
        }
    });

    Object.keys(categories).forEach(categoryKey => {
        const category = categories[categoryKey];
        if (category.items.length > 0) {
            const section = document.createElement('div');
            section.className = 'category-section';
            section.setAttribute('data-category', categoryKey);
            section.innerHTML = `
                <h3 class="maroon-primary mb-4 mt-5 animate__animated animate__fadeInLeft">${category.title}</h3>
                <hr class="mb-4">
                <div class="row row-cols-1 row-cols-md-2 row-cols-lg-4 g-4 mb-5" id="category-${categoryKey}">
                    <!-- Products will be injected here -->
                </div>
            `;
            menuItemsContainer.appendChild(section);

            const rowContainer = section.querySelector(`#category-${categoryKey}`);
            category.items.forEach(item => {
                const isSoldOut = (typeof item.stock === 'number') ? item.stock <= 0 : false;
                const col = document.createElement('div');
                col.className = 'col menu-item animate__animated animate__fadeInUp';
                col.setAttribute('data-category', item.category || 'others');

                const imageUrl = item.img && typeof item.img === 'string' && item.img.includes('http') ? item.img : `https://placehold.co/600x450/cccccc/333333?text=${encodeURIComponent((item.name || 'Product').slice(0,20))}`;

                col.innerHTML = `
                    <div class="card h-100 shadow-sm menu-card" ${isSoldOut ? '' : `data-bs-toggle="modal" data-bs-target="#itemModal" data-item-id="${item.id}"`}>
                        <div class="position-relative">
                            <img src="${imageUrl}" class="card-img-top" alt="${(item.name || '')}" onerror="this.onerror=null;this.src='https://placehold.co/600x450/cccccc/333333?text=EAZYMART'">
                            ${isSoldOut ? '<span class="sold-out">Sold Out</span><div class="sold-out-overlay"></div>' : ''}
                        </div>
                        <div class="card-body text-center">
                            <h6 class="card-title text-truncate">${item.name || 'Unnamed'}</h6>
                            <p class="card-text text-muted mb-2">₹${(Number(item.price) || 0).toFixed(2)}</p>
                        </div>
                    </div>
                `;
                rowContainer.appendChild(col);
            });
        }
    });
    window.filterItems('all'); // Apply initial filter
};

window.displayItemDetails = function(itemId) {
    const itemData = productsData[itemId];
    if (itemData) {
        document.getElementById('itemModalLabel').textContent = itemData.name;
        document.getElementById('modalItemName').textContent = itemData.name;
        document.getElementById('modalItemPrice').textContent = `₹${(Number(itemData.price)||0).toFixed(2)}`;
        const stockText = (typeof itemData.stock === 'number' && itemData.stock > 0) ? (itemData.stock >= 999 ? 'In Stock (Unlimited)' : `${itemData.stock} in stock`) : 'Out of Stock';
        document.getElementById('modalItemStock').textContent = stockText;
        document.getElementById('modalItemStock').className = itemData.stock >= 999 ? 'unlimited' : '';
        document.getElementById('modalItemImage').src = itemData.img || 'https://placehold.co/600x450/cccccc/333333?text=EAZYMART';
        document.getElementById('modalItemDescription').textContent = itemData.description || 'No description available.';

        const featuresList = document.getElementById('modalItemFeatures');
        featuresList.innerHTML = '';
        if (Array.isArray(itemData.features)) {
            itemData.features.forEach(feature => {
                const li = document.createElement('li');
                li.textContent = feature;
                featuresList.appendChild(li);
            });
        }

        const modalAddToCartBtn = document.getElementById('modalAddToCartBtn');
        modalAddToCartBtn.onclick = () => {
            if (typeof window.addToCart === 'function') {
                const cartItem = {
                    id: itemId, // This is the Loyverse Item Variant Handle!
                    name: itemData.name,
                    price: Number(itemData.price) || 0,
                };
                window.addToCart(JSON.stringify(cartItem));
                bootstrap.Modal.getInstance(document.getElementById('itemModal')).hide();
            } else {
                if (typeof window.showToast === 'function') window.showToast('Cart functionality not available.', 'danger');
            }
        };
        modalAddToCartBtn.disabled = (typeof itemData.stock === 'number') ? itemData.stock <= 0 : false;
    }
};

/**
 * Filters menu items based on the category clicked.
 * This is used by groceries.html.
 * @param {string} filter - The category key (e.g., 'dry-fruits', 'all').
 */
window.filterItems = function(filter) {
    const sections = document.querySelectorAll('.category-section');
    sections.forEach(section => {
        if (filter === 'all' || section.getAttribute('data-category') === filter) {
            section.style.display = 'block';
        } else {
            section.style.display = 'none';
        }
    });

    // Update active button state
    const categoryButtons = document.querySelectorAll('.category-btn');
    categoryButtons.forEach(button => {
        if (button.getAttribute('data-filter') === filter) {
            button.classList.add('active');
        } else {
            button.classList.remove('active');
        }
    });
};

// --- Cart Management Functions (Simplified) ---

window.cart = cart;

function saveCart() {
    localStorage.setItem('eazymartCart', JSON.stringify(cart));
    if (document.getElementById('orderSummary')) { updateCartDisplay(); }
    updateCartBadge();
}
window.saveCart = saveCart;

function addToCart(itemString) {
    const itemToAdd = JSON.parse(itemString);
    const existingItem = cart.find(item => item.id === itemToAdd.id);

    if (existingItem) {
        existingItem.quantity++;
    } else {
        itemToAdd.quantity = 1;
        itemToAdd.specialRequest = '';
        cart.push(itemToAdd);
    }
    saveCart();
    if (typeof showToast === 'function') showToast(`${itemToAdd.name} added to cart!`, 'success');
}
window.addToCart = addToCart;

function updateCartBadge() {
    const cartBadge = document.getElementById('cartBadge');
    if (cartBadge) {
        const totalItems = cart.reduce((total, item) => total + item.quantity, 0);
        if (totalItems > 0) {
            cartBadge.textContent = totalItems;
            cartBadge.style.display = 'block';
        } else {
            cartBadge.style.display = 'none';
        }
    }
}
window.updateCartBadge = updateCartBadge;

function removeFromCart(index) {
    const orderSummary = document.getElementById('orderSummary');
    if (orderSummary) {
        const itemElement = orderSummary.children[index];
        if (itemElement) {
            itemElement.classList.add('animate__animated', 'animate__fadeOut');

            setTimeout(() => {
                cart.splice(index, 1);
                saveCart(); 
            }, 300);
        }
    } else {
        cart.splice(index, 1);
        saveCart();
    }
}
window.removeFromCart = removeFromCart;

function updateQuantity(index, change) {
        const newQuantity = cart[index].quantity + change;
    if (newQuantity > 0) {
        // Optional: Check stock if available from productsData
        const itemId = cart[index].id;
        const itemData = productsData[itemId];
        const maxStock = (itemData && typeof itemData.stock === 'number') ? itemData.stock : 999;
        if (newQuantity <= maxStock) {
            cart[index].quantity = newQuantity;
            saveCart(); 
            updateTotals(); 
        } else {
            if (typeof showToast === 'function') showToast(`Only ${maxStock} available for ${cart[index].name}.`, 'warning');
        }
    } else {
        removeFromCart(index); 
    }
}
window.updateQuantity = updateQuantity;

function calculateSubtotal() {
    return cart.reduce((total, item) => total + (item.price * item.quantity), 0);
}
window.calculateSubtotal = calculateSubtotal;

function updateTotals() {
    const subtotal = calculateSubtotal();
    const orderTypeRadio = document.querySelector('input[name="orderType"]:checked');
    const orderType = orderTypeRadio ? orderTypeRadio.value : 'Delivery';
    const deliveryFee = (orderType === 'Delivery') ? 30 : 0;

    let currentDiscount = discount; 

    if (promoCode === 'EAZY10') {
        currentDiscount = subtotal * 0.1;
        if (currentDiscount > subtotal) currentDiscount = subtotal; 
        const discountRow = document.getElementById('discountRow');
        if (discountRow) discountRow.style.display = 'flex';
    } else {
        currentDiscount = 0;
        const discountRow = document.getElementById('discountRow');
        if (discountRow) discountRow.style.display = 'none';
    }

    const total = subtotal + deliveryFee - currentDiscount;

    const subtotalEl = document.getElementById('subtotal');
    if (subtotalEl) subtotalEl.textContent = `₹${subtotal.toFixed(2)}`;

    const deliveryFeeEl = document.getElementById('deliveryFee');
    if (deliveryFeeEl) deliveryFeeEl.textContent = `₹${deliveryFee.toFixed(2)}`;

    const discountAmountEl = document.getElementById('discountAmount');
    if (discountAmountEl) discountAmountEl.textContent = `-₹${currentDiscount.toFixed(2)}`;

    const totalAmountEl = document.getElementById('totalAmount');
    if (totalAmountEl) totalAmountEl.textContent = `₹${total.toFixed(2)}`;

    const confirmOrderBtn = document.getElementById('confirmOrderBtn');
    if (confirmOrderBtn) {
        confirmOrderBtn.disabled = cart.length === 0 || total <= 0;
    }

    const deliveryFeeRow = document.getElementById('deliveryFeeRow');
    if (deliveryFeeRow) {
        deliveryFeeRow.style.display = (orderType === 'Delivery') ? 'flex' : 'none';
    }
}
window.updateTotals = updateTotals;

function updateCartDisplay() {
    const orderSummary = document.getElementById('orderSummary');
    const emptyCartMessage = document.getElementById('emptyCartMessage');

    if (!orderSummary || !emptyCartMessage) return;

    if (cart.length === 0) {
        emptyCartMessage.style.display = 'block';
        orderSummary.innerHTML = '';
    } else {
        emptyCartMessage.style.display = 'none';
        orderSummary.innerHTML = '';

        cart.forEach((item, index) => {
            const itemElement = document.createElement('div');
            itemElement.className = 'cart-item mb-3 p-3 rounded animate__animated animate__fadeIn';
            itemElement.innerHTML = `
                <div class="d-flex justify-content-between align-items-start mb-2">
                    <div>
                        <h6 class="mb-1">${item.name}</h6>
                        <small class="text-muted">₹${item.price.toFixed(2)} each</small>
                    </div>
                    <button class="btn btn-sm btn-outline-danger" onclick="window.removeFromCart(${index})">
                        <i class="bi bi-trash"></i>
                    </button>
                </div>
                <div class="d-flex align-items-center">
                    <button class="quantity-control" onclick="window.updateQuantity(${index}, -1)">-</button>
                    <span class="mx-2">${item.quantity}</span>
                    <button class="quantity-control" onclick="window.updateQuantity(${index}, 1)">+</button>
                    <span class="ms-auto fw-bold">₹${(item.price * item.quantity).toFixed(2)}</span>
                </div>
                <div class="mt-2">
                    <input type="text" class="form-control form-control-sm" 
                           placeholder="Special request" 
                           value="${item.specialRequest || ''}"
                           onchange="window.cart[${index}].specialRequest = this.value; window.saveCart()">
                </div>
            `;
            orderSummary.appendChild(itemElement);
        });
    }
    updateTotals();
    updateCartBadge();
}
window.updateCartDisplay = updateCartDisplay;

// [NEW] Promo Code Handler (for the Apply button in order.html)
window.applyPromoCode = function() {
    const promoInput = document.getElementById('promoCode');
    if (!promoInput) return;
    
    promoCode = promoInput.value.trim().toUpperCase();
    if (promoCode === 'EAZY10') {
        discount = 0.1;  // 10% discount
        if (typeof showToast === 'function') showToast('Promo code applied! 10% off your subtotal.', 'success');
        updateTotals();
    } else {
        discount = 0;
        promoCode = '';
        if (typeof showToast === 'function') showToast('Invalid promo code. Try EAZY10 for 10% off.', 'warning');
        updateTotals();
    }
    promoInput.value = '';  // Clear input
};

// --- Order Submission (WRITE/Transaction) ---

async function processOrder() {
    const deliveryRangeMessage = document.getElementById('deliveryRangeMessage');
    if (deliveryRangeMessage) deliveryRangeMessage.style.display = 'none';

    // Basic front-end validation
    const customerNameInput = document.getElementById('customerName');
    const customerPhoneInput = document.getElementById('customerPhone');
    const customerEmailInput = document.getElementById('customerEmail');
    const deliveryAddressInput = document.getElementById('deliveryAddress');
    const detailedAddressInput = document.getElementById('detailedAddress');
    const orderType = document.querySelector('input[name="orderType"]:checked')?.value;
    const confirmOrderBtn = document.getElementById('confirmOrderBtn');

    let isValidForm = true;

    if (!customerNameInput || !customerNameInput.value.trim()) { 
        customerNameInput?.classList.add('is-invalid'); 
        isValidForm = false; 
    } else { 
        customerNameInput?.classList.remove('is-invalid'); 
    }
    if (!customerPhoneInput || !customerPhoneInput.value.trim()) { 
        customerPhoneInput?.classList.add('is-invalid'); 
        isValidForm = false; 
    } else { 
        customerPhoneInput?.classList.remove('is-invalid'); 
    }

    if (orderType === 'Delivery' && (!deliveryAddressInput || !deliveryAddressInput.value.trim())) {
        deliveryAddressInput?.classList.add('is-invalid');
        isValidForm = false;
    } else {
        deliveryAddressInput?.classList.remove('is-invalid');
    }
    if (!isValidForm) { 
        if (typeof showToast === 'function') showToast('Please fill in all required fields correctly.', 'danger'); 
        return; 
    }
    if (cart.length === 0) { 
        if (typeof showToast === 'function') showToast("Your cart is empty. Please add items before placing an order.", 'danger'); 
        return; 
    }

    if (confirmOrderBtn) {
        confirmOrderBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status"></span> Processing...';
        confirmOrderBtn.disabled = true;
    }

    const orderId = 'AA-' + Date.now().toString().slice(-8);
    let locationLat = null;
    let locationLng = null;

    if (orderType === 'Delivery' && deliveryMarker && deliveryMarker.getPosition) {
        try {
            const pos = deliveryMarker.getPosition();
            locationLat = pos.lat();
            locationLng = pos.lng();
        } catch (e) {
            console.warn("Delivery marker position not available:", e);
        }

        // Delivery range check
        const customerLocation = { lat: locationLat, lng: locationLng };
        const distance = window.calculateDistance(pickupLocation, customerLocation);

        if (distance > deliveryRadiusKm) {
            if (deliveryRangeMessage) deliveryRangeMessage.style.display = 'block';
            if (typeof showToast === 'function') showToast(`Your location is ${distance.toFixed(1)} km away, outside our ${deliveryRadiusKm} km delivery range.`, 'danger');
            if (confirmOrderBtn) {
                confirmOrderBtn.innerHTML = '<i class="bi bi-check-circle"></i> Confirm Order';
                confirmOrderBtn.disabled = false;
            }
            return;
        }
    }

    const currentOrder = {
        orderId,
        orderType: orderType,
        customer: { 
            name: customerNameInput?.value, 
            phone: customerPhoneInput?.value,
            email: customerEmailInput?.value || ''
        },
        location: { 
            address: deliveryAddressInput?.value || detailedAddressInput?.value || document.querySelector('#pickupFields p.form-control-plaintext')?.textContent.trim(),
            latitude: locationLat, 
            longitude: locationLng
        },
        items: JSON.parse(JSON.stringify(cart)),
        specialInstructions: document.getElementById('specialInstructions')?.value || 'None',
        subtotal: calculateSubtotal(),
        deliveryFee: (orderType === 'Delivery') ? 30 : 0,
        discount: discount,
        total: parseFloat(document.getElementById('totalAmount')?.textContent.replace('₹','') || '0'),
        promoCode: promoCode,
        timestamp: new Date().toISOString(),
        orderStatus: 'Received'
    };

    // [DEBUG] Log currentOrder before fetch to check if empty
    console.log('Sending currentOrder to Lambda:', currentOrder);
    if (currentOrder.items.length === 0 || currentOrder.total <= 0) {
        throw new Error('Invalid order: No items or total is zero. Check cart and form.');
    }

    try {
        // Send order to AWS Lambda (Loyverse sync)
        const response = await fetch(ORDER_SUBMIT_API_URL, {
            method: "POST",
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(currentOrder),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ message: 'No JSON response from server.' }));
            throw new Error(`Order submission failed: ${errorData.message || 'Unknown server error.'}`);
        }

        // [LATEST FIX] Parse Lambda response for Loyverse sync feedback (handles API Gateway wrap)
        let responseData = await response.json();
        console.log('Raw Lambda response:', responseData);  // DEBUG: Log full response to console (check F12)
        
        // FIXED: Handle API Gateway wrapping (body is stringified JSON)
        if (responseData.body && typeof responseData.body === 'string') {
            try {
                responseData = JSON.parse(responseData.body);
                console.log('Parsed wrapped body:', responseData);  // DEBUG: After parsing (should show {status: 'success', ...})
            } catch (parseErr) {
                console.error('Error parsing wrapped body:', parseErr, 'Body was:', responseData.body);
                throw new Error('Invalid response format from server.');
            }
        } else if (responseData.statusCode && responseData.body) {
            // Alternative wrap (if statusCode present)
            try {
                responseData = JSON.parse(responseData.body);
                console.log('Parsed alternative wrap:', responseData);
            } catch (parseErr) {
                console.error('Error parsing alternative wrap:', parseErr);
                throw new Error('Invalid response format from server.');
            }
        }
        
        console.log('Final responseData for check:', responseData);  // DEBUG: Before status check
        
        if (responseData.status === "success") {
            // Extract Loyverse ID (handles "0008" or UUID)
            currentOrder.loyverse_receipt_id = responseData.loyverse_receipt_id || responseData.receipt_number || 'N/A';
            saveOrderForTracking(currentOrder);
            showOrderDetailsModal(currentOrder);

            // Enhanced toast with Loyverse ID
            if (typeof showToast === 'function') {
                showToast(`Order ${currentOrder.orderId} placed successfully! Loyverse Receipt ID: ${currentOrder.loyverse_receipt_id}`, 'success', 7000);
            }

            cart = []; // Clear cart
            saveCart();
            document.getElementById('customerForm')?.reset();
            promoCode = '';
            discount = 0;
            window.toggleOrderType(); // Reset order type fields
        } else {
            // Better error handling: Show Lambda's message if available
            const errorMsg = responseData.message || responseData.error || 'Sync failed (check Lambda logs)';
            console.error('Lambda error details:', responseData);
            throw new Error(errorMsg);
        }

    } catch (error) {
        console.error('script.js: Error during order processing:', error);
        if (typeof showToast === 'function') {
            showToast(`An error occurred: ${error.message}. Please try again or contact support.`, 'danger', 7000);
        }
    } finally {
        if (confirmOrderBtn) {
            confirmOrderBtn.innerHTML = '<i class="bi bi-check-circle"></i> Confirm Order';
            confirmOrderBtn.disabled = false;
        }
    }
}
window.processOrder = processOrder;

// --- Utility Functions (exposed globally in original script.js) ---
window.showToast = function(message, type = 'info', duration = 3000) {
    const toastContainer = document.body;
    const toastId = `toast-${Date.now()}`;
    const toastHtml = `
        <div id="${toastId}" class="toast align-items-center text-white bg-${type === 'danger' ? 'danger' : (type === 'success' ? 'success' : 'info')} border-0 position-fixed bottom-0 end-0 m-3" role="alert" aria-live="assertive" aria-atomic="true" style="z-index: 1050; min-width: 250px;">
            <div class="d-flex">
                <div class="toast-body">${message}</div>
                <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
            </div>
        </div>
    `;
    toastContainer.insertAdjacentHTML('beforeend', toastHtml);
    const toastElement = document.getElementById(toastId);
    const toast = new bootstrap.Toast(toastElement, { delay: duration });
    toast.show();
    toastElement.addEventListener('hidden.bs.toast', function () { toastElement.remove(); });
};

window.toggleOrderType = function() { 
    const deliveryFields = document.getElementById('deliveryFields');
    const pickupFields = document.getElementById('pickupFields');
    const deliveryRadio = document.getElementById('orderTypeDelivery');
    const deliveryAddressInput = document.getElementById('deliveryAddress');
    const deliveryMap = document.getElementById('deliveryMap');
    const pickupMap = document.getElementById('pickupMap');
    const deliveryFeeRow = document.getElementById('deliveryFeeRow');
    const deliveryRangeMessage = document.getElementById('deliveryRangeMessage');

    if (!deliveryFields || !pickupFields || !deliveryRadio || !deliveryAddressInput || !deliveryMap || !pickupMap || !deliveryFeeRow || !deliveryRangeMessage) {
        return;
    }

    deliveryRangeMessage.style.display = 'none';

    if (deliveryRadio.checked) {
        deliveryFields.classList.remove('d-none');
        pickupFields.classList.add('d-none');
        deliveryAddressInput.setAttribute('required', 'required');
        deliveryMap.style.display = 'block';
        pickupMap.style.display = 'none';
    } else {
                deliveryFields.classList.add('d-none');
        pickupFields.classList.remove('d-none');
        deliveryAddressInput.removeAttribute('required');
        deliveryMap.style.display = 'none';
        pickupMap.style.display = 'block';
    }
    window.updateTotals();
};

window.initMapCallback = function() { 
    window.isGoogleMapsApiReady = true; 
    console.log('Google Maps API loaded successfully!');  // DEBUG: Confirm load
    window.dispatchEvent(new Event('googlemapsapiready')); 
};

window.saveOrderForTracking = function(order) { 
    let orders = JSON.parse(localStorage.getItem('eazymartOrders')) || [];
    orders.push(order);
    localStorage.setItem('eazymartOrders', JSON.stringify(orders));
    console.log('Order saved for tracking:', order.orderId);  // DEBUG
};

window.showOrderDetailsModal = function(order) {
    // [UPDATED] Enhanced modal with Loyverse ID
    const orderDetailsContent = document.getElementById('orderDetailsContent');
    if (orderDetailsContent) {
        orderDetailsContent.innerHTML = `
            <div class="mb-3">
                <strong>Website Order ID:</strong> ${order.orderId}<br>
                <strong>Loyverse Receipt ID:</strong> ${order.loyverse_receipt_id || 'N/A'}<br>
                <strong>Order Type:</strong> ${order.orderType}<br>
                <strong>Customer:</strong> ${order.customer.name} (${order.customer.phone})<br>
                <strong>Total:</strong> ₹${order.total.toFixed(2)}<br>
                <strong>Items:</strong> ${order.items.length} item(s)<br>
                <strong>Status:</strong> ${order.orderStatus}
            </div>
            <hr>
            <h6>Items:</h6>
            <ul class="list-unstyled">
                ${order.items.map(item => `<li>${item.name} x${item.quantity} - ₹${(item.price * item.quantity).toFixed(2)}</li>`).join('')}
            </ul>
            <hr>
            <p><strong>Address:</strong> ${order.location.address}</p>
            <p><strong>Special Instructions:</strong> ${order.specialInstructions}</p>
        `;
    }

    document.getElementById('orderDetailsModal')?.classList.add('active');
    document.getElementById('displayOrderId').textContent = order.orderId;
    document.getElementById('trackOrderLink').href = `tracking.html?orderId=${order.orderId}`;
    if (typeof confetti === 'function') { confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } }); }
};

window.printOrder = function() {
    const orderDetailsContent = document.getElementById('orderDetailsContent');
    const printWindow = window.open('', '_blank');
    printWindow.document.write('<html><head><title>Order Receipt</title>');
    printWindow.document.write('<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">');
    printWindow.document.write('<link rel="stylesheet" href="css/style.css">');
    printWindow.document.write('<style>@media print { body { -webkit-print-color-adjust: exact; } .modal-footer, .btn { display: none !important; } .alert { border: 1px solid currentColor !important; } }</style></head><body>');
    printWindow.document.write(`<div class="container p-4"><div class="text-center mb-4"><h2 class="aqua-text">EAZYMART</h2><h4 class="maroon-text">Order Receipt</h4><p>Order #${document.getElementById('displayOrderId')?.textContent || 'N/A'}</p></div>${orderDetailsContent.innerHTML}<p class="text-center mt-4">Thank you for your order! ❤️</p></div>`);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
    printWindow.close();
};

// Placeholder for Google Maps functions used in order.html
window.initMap = function() {
    // Basic map initialization (called by Google callback if needed)
    console.log('initMap called – Maps ready for delivery/pickup.');
};

window.geocodeLatLng = function(latLng, callback) {
    if (typeof google === 'undefined' || !geocoder) {
        console.warn('Google Maps not loaded for geocoding.');
        return;
    }
    geocoder.geocode({ location: latLng }, (results, status) => {
        if (status === 'OK' && results[0]) {
            callback(results[0].formatted_address);
        } else {
            console.error('Geocode failed:', status);
        }
    });
};

window.geocodeAddress = function(address, callback) {
    if (typeof google === 'undefined' || !geocoder) {
        console.warn('Google Maps not loaded for geocoding.');
        return;
    }
    geocoder.geocode({ address: address }, (results, status) => {
        if (status === 'OK' && results[0]) {
            const location = results[0].geometry.location;
            callback({ lat: location.lat(), lng: location.lng() });
        } else {
            console.error('Geocode failed:', status);
        }
    });
};

window.calculateDistance = function(point1, point2) {
    if (typeof google === 'undefined' || typeof google.maps.geometry === 'undefined') { 
        console.warn('Google Maps Geometry not loaded – using fallback distance (5 km).');
        return 5;  // FIXED: Fallback if not loaded
    }
    const latLng1 = new google.maps.LatLng(point1.lat, point1.lng);
    const latLng2 = new google.maps.LatLng(point2.lat, point2.lng);
    return google.maps.geometry.spherical.computeDistanceBetween(latLng1, latLng2) / 1000;
};

window.getOrderById = function(orderId) { 
    /* Logic handled in tracking.html */ 
    let orders = JSON.parse(localStorage.getItem('eazymartOrders')) || [];
    return orders.find(order => order.orderId === orderId) || {}; 
};