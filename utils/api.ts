/// <reference types="vite/client" />
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// Create axios instance
const api = axios.create({
    baseURL: API_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

// Request interceptor to add auth token
api.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem('authToken');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// Response interceptor to handle errors
api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401) {
            // Token expired or invalid
            localStorage.removeItem('authToken');
            localStorage.removeItem('user');
            window.location.href = '/';
        }
        return Promise.reject(error);
    }
);

export default api;

// API methods
export const authAPI = {
    signup: (data) => api.post('/api/auth/signup', data),
    login: (data) => api.post('/api/auth/login', data),
    refresh: (token) => api.post('/api/auth/refresh', { token }),
};

export const userAPI = {
    getProfile: () => api.get('/api/users/me'),
    updateProfile: (data) => api.put('/api/users/me', data),
    getDoctorProfile: () => api.get('/api/users/me/doctor-profile'),
    updateDoctorProfile: (data) => api.put('/api/users/me/doctor-profile', data),
    uploadLogo: (file) => {
        const formData = new FormData();
        formData.append('logo', file);
        return api.post('/api/users/me/upload-logo', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
        });
    },
};

export const subscriptionAPI = {
    getPlans: () => api.get('/api/subscriptions/plans'),
    getCurrent: () => api.get('/api/subscriptions/current'),
    getUsage: () => api.get('/api/subscriptions/usage'),
    createCheckoutSession: (planName) => api.post('/api/subscriptions/create-checkout-session', { planName }),
    cancel: () => api.post('/api/subscriptions/cancel'),
};

export const casesAPI = {
    create: (data) => api.post('/api/cases', data),
    list: (params) => api.get('/api/cases', { params }),
    get: (id) => api.get(`/api/cases/${id}`),
    update: (id, data) => api.put(`/api/cases/${id}`, data),
    delete: (id) => api.delete(`/api/cases/${id}`),
};
