<template>
    <f7-page login-screen class="login-page">
        <!-- Animated Background (Fixed Position) -->
        <div class="background-animation">
            <div class="blob blob-1"></div>
            <div class="blob blob-2"></div>
            <div class="blob blob-3"></div>
            <div class="grid-overlay"></div>
        </div>

        <div class="login-container display-flex justify-content-center align-items-center">
            <div class="glass-card">
                <div class="logo-area text-align-center margin-bottom">
                    <div class="logo-circle">
                        <!-- Used Material Icon 'bar_chart' which is standard -->
                        <f7-icon material="bar_chart" size="48" color="white"></f7-icon>
                    </div>
                    <h1 class="app-title">Analisis</h1>
                    <p class="app-subtitle">Smart Portfolio Tracking</p>
                </div>

                <div class="form-area margin-top">
                    <f7-button fill large class="google-btn" @click="handleGoogleLogin" :loading="auth.loading">
                        <!-- Inline SVG for Google Logo to ensure it renders correctly -->
                        <svg class="margin-right-half" width="24" height="24" viewBox="0 0 24 24"
                            xmlns="http://www.w3.org/2000/svg">
                            <path
                                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                                fill="#4285F4" />
                            <path
                                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                                fill="#34A853" />
                            <path
                                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.84z"
                                fill="#FBBC05" />
                            <path
                                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                                fill="#EA4335" />
                        </svg>
                        <span>Continue with Google</span>
                    </f7-button>
                </div>

                <div class="footer-text margin-top text-align-center">
                    <small>Secure. Real-time. Insightful.</small>
                </div>
            </div>
        </div>
    </f7-page>
</template>

<script setup lang="ts">
import { useAuthStore } from "../../stores/auth";

const auth = useAuthStore();

const handleGoogleLogin = () => {
    auth.login();
};
</script>

<style scoped>
/* Page Layout */
.login-page {
    /* Ensure page content is transparent so bg shows through */
    background: transparent !important;
    position: relative;
    overflow: hidden;
}

/* Container to center content */
.login-container {
    height: 100vh;
    /* Full viewport height */
    width: 100%;
    position: relative;
    z-index: 10;
    /* Above animation */
}

.hidden-title {
    display: none;
}

/* Background Animation - FIXED to cover screen */
.background-animation {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    z-index: 0;
    overflow: hidden;
    background: #0f172a;
}

.blob {
    position: absolute;
    border-radius: 50%;
    filter: blur(80px);
    opacity: 0.6;
    animation: float 10s infinite ease-in-out;
}

.blob-1 {
    background: #4f46e5;
    /* Indigo */
    width: 400px;
    height: 400px;
    top: -100px;
    left: -50px;
    animation-delay: 0s;
}

.blob-2 {
    background: #06b6d4;
    /* Cyan */
    width: 300px;
    height: 300px;
    bottom: -50px;
    right: -50px;
    animation-delay: 2s;
}

.blob-3 {
    background: #EC4899;
    /* Pink */
    width: 250px;
    height: 250px;
    top: 40%;
    left: 30%;
    animation-delay: 4s;
    opacity: 0.4;
}

@keyframes float {
    0% {
        transform: translate(0, 0) scale(1);
    }

    33% {
        transform: translate(30px, -50px) scale(1.1);
    }

    66% {
        transform: translate(-20px, 20px) scale(0.9);
    }

    100% {
        transform: translate(0, 0) scale(1);
    }
}

/* Abstract Grid Overlay for "Finance" feel */
.grid-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-image:
        linear-gradient(rgba(255, 255, 255, 0.03) 1px, transparent 1px),
        linear-gradient(90deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px);
    background-size: 40px 40px;
    z-index: 1;
}

/* Glass Card */
.glass-card {
    position: relative;
    z-index: 10;
    background: rgba(255, 255, 255, 0.05);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 24px;
    padding: 40px 32px;
    width: 100%;
    max-width: 400px;
    box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.36);
    display: flex;
    flex-direction: column;
    align-items: center;
}

.logo-circle {
    width: 80px;
    height: 80px;
    background: linear-gradient(135deg, #4f46e5, #06b6d4);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0 auto 16px;
    box-shadow: 0 4px 12px rgba(79, 70, 229, 0.4);
}

.app-title {
    font-size: 32px;
    font-weight: 700;
    margin: 0;
    background: linear-gradient(to right, #ffffff, #cbd5e1);
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
    letter-spacing: -0.5px;
}

.app-subtitle {
    color: #94a3b8;
    font-size: 16px;
    margin-top: 8px;
    margin-bottom: 0;
}

.google-btn {
    background: white !important;
    color: #1e293b !important;
    font-weight: 600;
    border-radius: 12px;
    text-transform: none;
    height: 56px;
    font-size: 16px;
    transition: transform 0.2s;
}

.google-btn:active {
    transform: scale(0.98);
}

.footer-text small {
    color: #64748b;
    font-size: 12px;
}
</style>
