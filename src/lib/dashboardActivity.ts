import { createContext, useContext } from 'react';

// Defaults to active for standalone dashboard renders and component tests.
export const DashboardActivityContext = createContext(true);
export const useDashboardActive = () => useContext(DashboardActivityContext);
