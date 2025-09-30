# Hot Products Feature

## Overview
This feature allows administrators to add "Hot Products" from AliExpress to the main page, which are displayed in a horizontally scrollable section.

## Features

### Admin Panel
- **Add 5 Hot Products Button**: Fetches 5 random products from AliExpress and saves them to the database
- **Clear Hot Products Button**: Removes all hot products from the database
- **Sync AliExpress Products Button**: Existing functionality for syncing products by category

### Main Page
- **Hot Products Section**: Displays hot products in a horizontally scrollable container
- **Responsive Design**: Works on desktop, tablet, and mobile devices
- **Smooth Scrolling**: Custom scrollbar with gradient styling
- **Hover Effects**: Cards lift and images scale on hover

## How to Use

### Adding Hot Products
1. Go to the admin panel (`/admin`)
2. Click the "🔥 Add 5 Hot Products" button
3. The system will:
   - Fetch 5 random products from AliExpress
   - Upload product images to Firebase Storage
   - Save product data to Firestore
   - Display success/error message

### Viewing Hot Products
- Hot products automatically appear on the main page in the "🔥 מוצרים חמים" section
- Users can scroll horizontally to view all hot products
- Each product card shows:
  - Product image
  - Product name
  - Price
  - Hot badge (🔥)

### Clearing Hot Products
1. Go to the admin panel (`/admin`)
2. Click the "🗑️ Clear Hot Products" button
3. Confirm the action
4. All hot products will be removed from the database

## Technical Details

### Files Created/Modified
- `pages/api/hot-products.js` - API endpoint for fetching hot products
- `lib/hot-products.js` - Library functions for managing hot products
- `components/HotProducts.js` - React component for displaying hot products
- `styles/HotProducts.module.css` - CSS styles for the hot products section
- `pages/admin.js` - Added hot products buttons
- `pages/index.js` - Added HotProducts component

### Database Structure
Hot products are stored in the `products` collection with the following additional fields:
- `isHot: true` - Identifies the product as a hot product
- `hotProductAddedAt` - Timestamp when the product was added as hot
- `source: 'aliexpress'` - Indicates the product source

### API Endpoints
- `GET /api/hot-products?limit=5` - Fetches random products from AliExpress

## Styling
- Orange gradient theme (`#ff6b35` to `#f7931e`)
- Smooth animations and hover effects
- Responsive design for all screen sizes
- Custom scrollbar styling
- Pulsing hot badge animation

## Error Handling
- Graceful fallback for missing images
- Error messages for failed API calls
- Loading states for better UX
- Console logging for debugging

## Future Enhancements
- Automatic rotation of hot products
- Analytics tracking for hot product clicks
- Category-based hot products
- User voting system for hot products
