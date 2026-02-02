import MainLayout from "../layouts/MainLayout.vue";
import LoginPage from "../pages/auth/LoginPage.vue";
import ChartPage from "../pages/chart/ChartPage.vue";
import HoldingsPage from "../pages/holdings/HoldingsPage.vue";
import StrategyDetailPage from "../pages/strategy/StrategyDetailPage.vue";
import StrategyPage from "../pages/strategy/StrategyPage.vue";
import { useAuthStore } from "../stores/auth";

export const routes = [
	{
		path: "/",
		async: async ({ resolve }: any) => {
			const auth = useAuthStore();
			if (auth.isAuthenticated) {
				resolve({ component: MainLayout });
			} else {
				// If not authenticated, we can render Login page directly on root
				// OR resolve a redirect component.
				// Rendering Login is smoother.
				resolve({ component: LoginPage });
			}
		},
	},
	{
		path: "/login/",
		component: LoginPage,
	},
	{
		path: "/strategy/",
		component: StrategyPage,
	},
	{
		path: "/strategy/:id/",
		component: StrategyDetailPage,
	},
	{
		path: "/holdings/",
		component: HoldingsPage,
	},
	{
		path: "/chart/",
		component: ChartPage,
	},
	// Future routes for deep navigation
	// { path: '/transaction/:id', component: TransactionDetail },
];
