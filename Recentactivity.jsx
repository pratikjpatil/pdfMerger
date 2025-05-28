// ActivityContext.js - Create a context to manage activity state
import React, { createContext, useContext, useReducer, useEffect } from 'react';

// Types of activities we'll track
export const ACTIVITY_TYPES = {
  OPEN_REPORT: 'OPEN_REPORT',
  SAVE_REPORT: 'SAVE_REPORT',
  SUBMIT_REPORT: 'SUBMIT_REPORT',
  EDIT_REPORT: 'EDIT_REPORT',
  DELETE_REPORT: 'DELETE_REPORT',
  VIEW_PAGE: 'VIEW_PAGE',
  INTERACT_COMPONENT: 'INTERACT_COMPONENT',
};

// Create the context
const ActivityContext = createContext();

// Initial state for our activity tracker
const initialState = {
  activities: [],
  loading: false,
};

// Reducer to handle activity state updates
function activityReducer(state, action) {
  switch (action.type) {
    case 'ADD_ACTIVITY':
      // Add new activity to the beginning of the array
      const newActivities = [action.payload, ...state.activities];
      // Keep only the most recent 50 activities
      const trimmedActivities = newActivities.slice(0, 50);
      // Save to localStorage
      localStorage.setItem('recentActivities', JSON.stringify(trimmedActivities));
      return {
        ...state,
        activities: trimmedActivities,
      };
    case 'LOAD_ACTIVITIES':
      return {
        ...state,
        activities: action.payload,
        loading: false,
      };
    case 'SET_LOADING':
      return {
        ...state,
        loading: action.payload,
      };
    case 'CLEAR_ACTIVITIES':
      localStorage.removeItem('recentActivities');
      return {
        ...state,
        activities: [],
      };
    default:
      return state;
  }
}

// Provider component
export function ActivityProvider({ children }) {
  const [state, dispatch] = useReducer(activityReducer, initialState);

  // Load activities from localStorage on mount
  useEffect(() => {
    dispatch({ type: 'SET_LOADING', payload: true });
    const savedActivities = localStorage.getItem('recentActivities');
    if (savedActivities) {
      dispatch({ type: 'LOAD_ACTIVITIES', payload: JSON.parse(savedActivities) });
    } else {
      dispatch({ type: 'LOAD_ACTIVITIES', payload: [] });
    }
  }, []);

  // Function to add a new activity
  const addActivity = (activityType, details) => {
    const newActivity = {
      id: Date.now(), // Simple unique id based on timestamp
      type: activityType,
      details,
      timestamp: new Date().toISOString(),
    };
    
    dispatch({ type: 'ADD_ACTIVITY', payload: newActivity });
    return newActivity.id; // Return id in case it's needed
  };

  // Function to clear all activities
  const clearActivities = () => {
    dispatch({ type: 'CLEAR_ACTIVITIES' });
  };

  return (
    <ActivityContext.Provider 
      value={{ 
        activities: state.activities,
        loading: state.loading, 
        addActivity,
        clearActivities,
        ACTIVITY_TYPES,
      }}
    >
      {children}
    </ActivityContext.Provider>
  );
}

// Custom hook to use the activity context
export function useActivity() {
  const context = useContext(ActivityContext);
  if (context === undefined) {
    throw new Error('useActivity must be used within an ActivityProvider');
  }
  return context;
}

// ActivityTrackers.js - Automatic activity tracking hooks and HOCs
import React, { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useActivity, ACTIVITY_TYPES } from './ActivityContext';

// Hook to automatically track page views
export function usePageViewTracker() {
  const location = useLocation();
  const { addActivity } = useActivity();
  
  useEffect(() => {
    // Get page name from pathname
    const pageName = location.pathname === '/' 
      ? 'Home' 
      : location.pathname.split('/').filter(Boolean).pop();
    
    // Track page view
    addActivity(ACTIVITY_TYPES.VIEW_PAGE, {
      path: location.pathname,
      pageName: formatPageName(pageName || 'Unknown'),
    });
  }, [location.pathname, addActivity]);
}

// Format page name from URL path
function formatPageName(path) {
  return path
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// HOC to automatically track component interactions
export function withActivityTracking(WrappedComponent, options = {}) {
  return function TrackedComponent(props) {
    const { addActivity } = useActivity();
    
    // Generate a descriptive name for the interaction
    const componentName = options.name || WrappedComponent.displayName || WrappedComponent.name || 'Component';
    
    // Define the handler wrapper that will track the activity
    const trackActivity = (actionType, itemName, originalHandler) => (...args) => {
      // Track the activity
      addActivity(actionType, {
        component: componentName,
        item: itemName,
        ...(options.additionalData || {}),
      });
      
      // Call the original handler if it exists
      if (originalHandler) {
        return originalHandler(...args);
      }
    };
    
    // Create enhanced props with tracking
    const enhancedProps = { ...props };
    
    // Process each prop to add tracking
    Object.keys(props).forEach(key => {
      if (typeof props[key] === 'function' && key.startsWith('on')) {
        // This is probably an event handler
        const actionType = mapEventToActionType(key);
        if (actionType) {
          enhancedProps[key] = trackActivity(
            actionType,
            options.itemName || componentName,
            props[key]
          );
        }
      }
    });
    
    return <WrappedComponent {...enhancedProps} />;
  };
}

// Map event handler names to activity types
function mapEventToActionType(eventName) {
  switch (eventName.toLowerCase()) {
    case 'onclick':
      return ACTIVITY_TYPES.INTERACT_COMPONENT;
    case 'onsubmit':
      return ACTIVITY_TYPES.SUBMIT_REPORT;
    case 'onsave':
    case 'onchange':
      return ACTIVITY_TYPES.SAVE_REPORT;
    case 'onopen':
    case 'onload':
      return ACTIVITY_TYPES.OPEN_REPORT;
    case 'ondelete':
    case 'onremove':
      return ACTIVITY_TYPES.DELETE_REPORT;
    case 'onedit':
      return ACTIVITY_TYPES.EDIT_REPORT;
    default:
      return ACTIVITY_TYPES.INTERACT_COMPONENT;
  }
}

// Track report-specific interactions automatically
export function useReportTracker() {
  const { addActivity, ACTIVITY_TYPES } = useActivity();
  
  // Create auto-tracking handlers
  const createAutoTrackingHandler = (reportInfo, activityType) => {
    return () => {
      addActivity(activityType, {
        reportId: reportInfo.id,
        reportName: reportInfo.name,
        reportType: reportInfo.type,
        automatic: true,
      });
    };
  };
  
  return {
    trackReportOpen: (reportInfo) => createAutoTrackingHandler(reportInfo, ACTIVITY_TYPES.OPEN_REPORT)(),
    trackReportSave: (reportInfo) => createAutoTrackingHandler(reportInfo, ACTIVITY_TYPES.SAVE_REPORT)(),
    trackReportSubmit: (reportInfo) => createAutoTrackingHandler(reportInfo, ACTIVITY_TYPES.SUBMIT_REPORT)(),
    trackReportEdit: (reportInfo) => createAutoTrackingHandler(reportInfo, ACTIVITY_TYPES.EDIT_REPORT)(),
    trackReportDelete: (reportInfo) => createAutoTrackingHandler(reportInfo, ACTIVITY_TYPES.DELETE_REPORT)(),
  };
}

// Route Tracker component - Automatically track route changes
export function RouteTracker() {
  usePageViewTracker();
  return null; // This component doesn't render anything
}

// AutomaticReportTracker.js - Component to automatically track report interactions 
import React, { useEffect, useRef } from 'react';
import { useActivity, ACTIVITY_TYPES } from './ActivityContext';

// Component to wrap around a report to automatically track interactions
export function AutoReportTracker({ 
  children, 
  reportId, 
  reportName, 
  reportType = 'General',
  trackOpen = true,
  trackEdit = true
}) {
  const { addActivity } = useActivity();
  const hasTrackedOpen = useRef(false);
  const lastEditTime = useRef(null);
  const contentRef = useRef(null);
  
  // Track when the report is opened/viewed
  useEffect(() => {
    if (trackOpen && !hasTrackedOpen.current) {
      addActivity(ACTIVITY_TYPES.OPEN_REPORT, {
        reportId,
        reportName,
        reportType,
        automatic: true,
      });
      hasTrackedOpen.current = true;
    }
  }, [trackOpen, reportId, reportName, reportType, addActivity]);
  
  // Track edits with a debounce to prevent too many events
  useEffect(() => {
    if (!trackEdit) return;
    
    const handleUserInteraction = () => {
      const now = Date.now();
      // Only track if it's been at least 30 seconds since the last edit
      if (!lastEditTime.current || (now - lastEditTime.current > 30000)) {
        addActivity(ACTIVITY_TYPES.EDIT_REPORT, {
          reportId,
          reportName,
          reportType,
          automatic: true,
        });
        lastEditTime.current = now;
      }
    };
    
    // Add event listeners to detect user interaction with report content
    const element = contentRef.current;
    if (element) {
      element.addEventListener('input', handleUserInteraction);
      element.addEventListener('change', handleUserInteraction);
      element.addEventListener('keyup', handleUserInteraction);
    }
    
    return () => {
      // Clean up event listeners
      if (element) {
        element.removeEventListener('input', handleUserInteraction);
        element.removeEventListener('change', handleUserInteraction);
        element.removeEventListener('keyup', handleUserInteraction);
      }
    };
  }, [trackEdit, reportId, reportName, reportType, addActivity]);
  
  // Clone the child element with the ref
  return React.cloneElement(children, { ref: contentRef });
}

// RecentActivityList.js - Component to display recent activities
import React from 'react';
import { useActivity } from './ActivityContext';

// Helper function to format the timestamp
function formatTimestamp(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();
  const diffInSeconds = Math.floor((now - date) / 1000);
  
  if (diffInSeconds < 60) {
    return 'Just now';
  } else if (diffInSeconds < 3600) {
    const minutes = Math.floor(diffInSeconds / 60);
    return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  } else if (diffInSeconds < 86400) {
    const hours = Math.floor(diffInSeconds / 3600);
    return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  } else {
    const days = Math.floor(diffInSeconds / 86400);
    return `${days} day${days > 1 ? 's' : ''} ago`;
  }
}

// Activity icon mapping
function ActivityIcon({ type }) {
  const { ACTIVITY_TYPES } = useActivity();
  
  switch (type) {
    case ACTIVITY_TYPES.OPEN_REPORT:
      return <span className="activity-icon">📂</span>;
    case ACTIVITY_TYPES.SAVE_REPORT:
      return <span className="activity-icon">💾</span>;
    case ACTIVITY_TYPES.SUBMIT_REPORT:
      return <span className="activity-icon">📤</span>;
    case ACTIVITY_TYPES.EDIT_REPORT:
      return <span className="activity-icon">✏️</span>;
    case ACTIVITY_TYPES.DELETE_REPORT:
      return <span className="activity-icon">🗑️</span>;
    case ACTIVITY_TYPES.VIEW_PAGE:
      return <span className="activity-icon">👁️</span>;
    case ACTIVITY_TYPES.INTERACT_COMPONENT:
      return <span className="activity-icon">🖱️</span>;
    default:
      return <span className="activity-icon">📄</span>;
  }
}

// Format activity message
function getActivityMessage(activity) {
  const { ACTIVITY_TYPES } = useActivity();
  
  switch (activity.type) {
    case ACTIVITY_TYPES.OPEN_REPORT:
      return `Opened report "${activity.details.reportName}"`;
    case ACTIVITY_TYPES.SAVE_REPORT:
      return `Saved report "${activity.details.reportName}"`;
    case ACTIVITY_TYPES.SUBMIT_REPORT:
      return `Submitted report "${activity.details.reportName}"`;
    case ACTIVITY_TYPES.EDIT_REPORT:
      return `Edited report "${activity.details.reportName}"`;
    case ACTIVITY_TYPES.DELETE_REPORT:
      return `Deleted report "${activity.details.reportName}"`;
    case ACTIVITY_TYPES.VIEW_PAGE:
      return `Visited ${activity.details.pageName} page`;
    case ACTIVITY_TYPES.INTERACT_COMPONENT:
      return `Interacted with ${activity.details.item || 'component'}`;
    default:
      return activity.details.reportName 
        ? `Interacted with report "${activity.details.reportName}"`
        : `Performed an action on ${activity.details.component || 'the application'}`;
  }
}

export function RecentActivityList() {
  const { activities, loading } = useActivity();

  if (loading) {
    return <div className="loading">Loading recent activities...</div>;
  }

  if (activities.length === 0) {
    return <div className="no-activities">No recent activities</div>;
  }

  return (
    <div className="recent-activity-list">
      <h2>Recent Activity</h2>
      <ul>
        {activities.map((activity) => (
          <li key={activity.id} className="activity-item">
            <ActivityIcon type={activity.type} />
            <div className="activity-content">
              <p className="activity-message">{getActivityMessage(activity)}</p>
              <p className="activity-time">{formatTimestamp(activity.timestamp)}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Usage examples

// App.js - Example setup for automatic activity tracking
import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { ActivityProvider } from './ActivityContext';
import { RouteTracker, RecentActivityList } from './ActivityTrackers';
import Dashboard from './Dashboard';
import ReportDetailPage from './ReportDetailPage';
import HomePage from './HomePage';

function App() {
  return (
    <ActivityProvider>
      <Router>
        {/* This tracks all route changes automatically */}
        <RouteTracker />
        
        <div className="app">
          <header>
            <h1>Reports Dashboard</h1>
          </header>
          
          <div className="content">
            <aside className="sidebar">
              <RecentActivityList />
            </aside>
            
            <main>
              <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/reports/:reportId" element={<ReportDetailPage />} />
              </Routes>
            </main>
          </div>
        </div>
      </Router>
    </ActivityProvider>
  );
}

export default App;

// ReportDetailPage.js - Example of using AutoReportTracker
import React from 'react';
import { useParams } from 'react-router-dom';
import { AutoReportTracker } from './ActivityTrackers';

// Mock report data (in a real app, you'd fetch this)
const REPORTS = {
  '1': { id: '1', name: 'Q1 Financial Report', type: 'Financial' },
  '2': { id: '2', name: 'User Engagement Metrics', type: 'Analytics' },
  '3': { id: '3', name: 'Product Performance Analysis', type: 'Product' },
};

function ReportDetailPage() {
  const { reportId } = useParams();
  const report = REPORTS[reportId] || { id: reportId, name: 'Unknown Report', type: 'General' };
  
  return (
    <div className="report-detail-page">
      <h2>{report.name}</h2>
      
      {/* The report content will be automatically tracked */}
      <AutoReportTracker 
        reportId={report.id}
        reportName={report.name}
        reportType={report.type}
      >
        <div className="report-content">
          {/* Report content goes here */}
          <p>This is the content of {report.name}.</p>
          
          {/* Any interactions with elements in here will be tracked */}
          <textarea 
            placeholder="Add notes to this report..." 
            className="report-notes"
          />
          
          <div className="report-actions">
            <button className="save-btn">Save Report</button>
            <button className="submit-btn">Submit Report</button>
          </div>
        </div>
      </AutoReportTracker>
    </div>
  );
}

export default ReportDetailPage;

// ReportCard.js - Example of using HOC for tracking
import React from 'react';
import { withActivityTracking } from './ActivityTrackers';

function ReportCard({ report, onOpen, onSave, onSubmit }) {
  return (
    <div className="report-card">
      <h3>{report.name}</h3>
      <div className="report-actions">
        <button onClick={onOpen}>Open</button>
        <button onClick={onSave}>Save</button>
        <button onClick={onSubmit}>Submit</button>
      </div>
    </div>
  );
}

// Wrap the component with automatic tracking
export default withActivityTracking(ReportCard, { 
  name: 'ReportCard',
  additionalData: { componentType: 'card' }
});

// Dashboard.js - Example of using useReportTracker hook
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useReportTracker } from './ActivityTrackers';

function Dashboard() {
  const navigate = useNavigate();
  const { trackReportOpen } = useReportTracker();
  
  const reports = [
    { id: '1', name: 'Q1 Financial Report', type: 'Financial' },
    { id: '2', name: 'User Engagement Metrics', type: 'Analytics' },
    { id: '3', name: 'Product Performance Analysis', type: 'Product' },
  ];
  
  const handleReportClick = (report) => {
    // Track report opening
    trackReportOpen(report);
    
    // Navigate to report detail page
    navigate(`/reports/${report.id}`);
  };
  
  return (
    <div className="dashboard">
      <h2>Your Reports</h2>
      <div className="reports-grid">
        {reports.map(report => (
          <div 
            key={report.id} 
            className="report-item"
            onClick={() => handleReportClick(report)}
          >
            <h3>{report.name}</h3>
            <p>{report.type}</p>
          </div>
        ))}
      </div>
    </div>
  );
      }
