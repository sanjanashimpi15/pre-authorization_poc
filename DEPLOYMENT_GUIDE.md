# opdv3 Deployment to opd.aivanahealth.com

## Overview

opdv3 will be deployed to **opd.aivanahealth.com**, replacing opdv4 as the main OPD product.

---

## Configuration Changes

### Environment Variables

**Production (.env)**:
```bash
VITE_API_URL=https://api.aivanahealth.com
VITE_PRODUCT_URL=https://opd.aivanahealth.com
GEMINI_API_KEY=your-key-here
```

### AuthModal Changes

Removed redirect after login/signup since opdv3 IS the product itself (not a separate marketing site).

---

## Deployment Steps

### 1. Deploy to Vercel

```bash
cd opdv3
npm run build
npx vercel --prod
```

### 2. Configure Custom Domain in Vercel

1. Go to Vercel Dashboard → opdv3 → Settings → Domains
2. Add domain: `opd.aivanahealth.com`
3. Vercel will provide DNS records

### 3. Update DNS Records

Add CNAME record in your domain registrar:

```
Type    Name    Value                   TTL
CNAME   opd     cname.vercel-dns.com   3600
```

### 4. Configure Environment Variables in Vercel

Go to: https://vercel.com/akashs-projects-70e052ab/opdv3/settings/environment-variables

Add for **Production**:
```bash
VITE_API_URL=https://api.aivanahealth.com
VITE_PRODUCT_URL=https://opd.aivanahealth.com
GEMINI_API_KEY=your-key-here
```

### 5. Update Backend CORS

**File**: `backend/src/server.js`

Ensure opdv3 domain is included:
```javascript
const corsOptions = {
  origin: [
    'https://aivanahealth.com',
    'https://www.aivanahealth.com',
    'https://opd.aivanahealth.com',  // opdv3 will use this
    'http://localhost:5173',
    'http://localhost:5174'
  ],
  credentials: true
};
```

### 6. Redeploy Backend

```bash
cd backend
npx vercel --prod
```

---

## Testing Checklist

After deployment:

- [ ] Visit https://opd.aivanahealth.com
- [ ] App loads without errors
- [ ] Click "Login / Sign Up" button
- [ ] Login with existing account
- [ ] Verify user menu shows name
- [ ] Create a new OPD case
- [ ] Verify usage limit banner shows "X/10 cases"
- [ ] Test logout functionality
- [ ] Sign up with new account
- [ ] Verify 10 cases/day limit enforcement

---

## Migration from opdv4

Since opdv3 will replace opdv4 on the same domain:

1. **No data migration needed** - Both use the same backend/database
2. **Users won't notice** - Same domain, seamless transition
3. **opdv4 can be archived** - Keep as backup if needed

---

## Production URLs

| Component | Domain |
|-----------|--------|
| Marketing Website | https://aivanahealth.com |
| OPD Product (opdv3) | https://opd.aivanahealth.com |
| Backend API | https://api.aivanahealth.com |

---

## Key Differences: opdv3 vs opdv4

| Feature | opdv3 | opdv4 |
|---------|-------|-------|
| Authentication UI | ✅ Integrated | ✅ Integrated |
| Usage Limits | ✅ Integrated | ✅ Integrated |
| Subscriptions | ✅ Integrated | ✅ Integrated |
| Login Redirect | ❌ None (already in product) | ✅ Redirects to product |
| Domain | opd.aivanahealth.com | opd.aivanahealth.com |

opdv3 is now the production-ready version with all database features integrated.
