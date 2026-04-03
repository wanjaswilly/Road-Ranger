import React, { useState, useEffect } from 'react';
import { 
  BrowserRouter as Router, 
  Routes, 
  Route, 
  Navigate
} from 'react-router-dom';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  GoogleAuthProvider,
  User as FirebaseUser,
  signOut
} from 'firebase/auth';
import { 
  doc, 
  getDoc, 
  setDoc, 
  serverTimestamp,
  collection,
  onSnapshot,
  query,
  orderBy,
  addDoc
} from 'firebase/firestore';
import { auth, db } from './firebase';
import { 
  MapPin, 
  Shield, 
  AlertTriangle, 
  Navigation as NavIcon, 
  Plus, 
  X, 
  Car, 
  Truck, 
  Bike,
  Info,
  Heart,
  Settings,
  LogOut,
  Route as RouteIcon,
  CheckCircle2,
  Menu,
  Search,
  History
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';

// Fix Leaflet marker icons
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

const DefaultIcon = L.icon({
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

// --- Utility ---
enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string;
    email?: string | null;
    emailVerified?: boolean;
    isAnonymous?: boolean;
    tenantId?: string | null;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; error: Error | null }> {
  state = { hasError: false, error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  render() {
    const { hasError, error } = this.state;
    if (hasError) {
      let message = "Something went wrong.";
      try {
        const parsed = JSON.parse(error?.message || "");
        if (parsed.error) message = `Firestore Error: ${parsed.error}`;
      } catch (e) {
        message = error?.message || message;
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
          <div className="max-w-md w-full bg-white p-8 rounded-3xl shadow-xl border border-slate-100 text-center space-y-4">
            <div className="w-16 h-16 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mx-auto">
              <AlertTriangle size={32} />
            </div>
            <h2 className="text-xl font-bold text-slate-900">Application Error</h2>
            <p className="text-slate-600 text-sm">{message}</p>
            <Button onClick={() => window.location.reload()} className="w-full">
              Reload Application
            </Button>
          </div>
        </div>
      );
    }

    return (this as any).props.children;
  }
}

// --- Types ---
interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  vehicleType?: string;
  vehicleParticulars?: string;
  createdAt: any;
}

interface RoadReport {
  id: string;
  type: 'Hazard' | 'RoadBlock' | 'TollStation' | 'Shortcut' | 'NewRoute' | 'DrivingCondition' | 'Levy' | 'Collection' | 'Requirement';
  subtype?: string;
  location: { lat: number; lng: number };
  description?: string;
  authorUid: string;
  authorName?: string;
  createdAt: any;
}

// --- Components ---

const Button = ({ 
  children, 
  className, 
  variant = 'primary', 
  size = 'md',
  ...props 
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { 
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
}) => {
  const variants = {
    primary: 'bg-orange-600 text-white hover:bg-orange-700 shadow-sm',
    secondary: 'bg-slate-800 text-white hover:bg-slate-900 shadow-sm',
    outline: 'border-2 border-slate-200 text-slate-700 hover:bg-slate-50',
    ghost: 'text-slate-600 hover:bg-slate-100',
    danger: 'bg-red-600 text-white hover:bg-red-700 shadow-sm',
  };
  
  const sizes = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2',
    lg: 'px-6 py-3 text-lg font-semibold',
  };

  return (
    <button 
      className={cn(
        'inline-flex items-center justify-center rounded-xl transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none',
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
};

const Card = ({ children, className, ...props }: { children: React.ReactNode; className?: string; [key: string]: any }) => (
  <div className={cn('bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden', className)} {...props}>
    {children}
  </div>
);

// --- Pages ---

const Login = () => {
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async () => {
    setError(null);
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (err: any) {
      console.error('Login failed:', err);
      if (err.code === 'auth/popup-blocked') {
        setError('The login popup was blocked by your browser. Please allow popups for this site or try opening the app in a new tab.');
      } else {
        setError('Login failed. Please try again.');
      }
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full text-center space-y-8"
      >
        <div className="space-y-4">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-orange-600 text-white shadow-xl shadow-orange-200 mb-4">
            <Shield size={40} />
          </div>
          <h1 className="text-4xl font-bold text-slate-900 tracking-tight">Road Ranger</h1>
          <p className="text-slate-600 text-lg">A drivers for drivers app. Real-time road updates, hazards, and community navigation.</p>
        </div>

        <Card className="p-8 space-y-6">
          <div className="space-y-2">
            <h2 className="text-xl font-semibold text-slate-800">Welcome Back</h2>
            <p className="text-sm text-slate-500">Sign in to access real-time road reports and navigation.</p>
          </div>
          
          {error && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="p-4 bg-red-50 border border-red-100 rounded-xl text-sm text-red-600 text-left space-y-2"
            >
              <div className="flex items-center gap-2 font-bold">
                <AlertTriangle size={16} />
                <span>Login Error</span>
              </div>
              <p>{error}</p>
              <p className="text-xs opacity-80">Tip: Look for a "popup blocked" icon in your browser's address bar and select "Always allow".</p>
            </motion.div>
          )}

          <Button onClick={handleLogin} className="w-full py-4" size="lg">
            Sign in with Google
          </Button>

          <div className="pt-4 border-t border-slate-100 flex items-center justify-center gap-2 text-xs text-slate-400">
            <Heart size={12} className="text-red-400" />
            <span>Non-profit & Community Driven</span>
          </div>
        </Card>

        <div className="text-xs text-slate-400 space-y-1">
          <p>Having trouble? Try opening the app in a new tab using the icon in the top right corner of the preview.</p>
        </div>
      </motion.div>
    </div>
  );
};

const VehicleSetup = ({ onComplete }: { onComplete: () => void }) => {
  const [vehicleType, setVehicleType] = useState('');
  const [particulars, setParticulars] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vehicleType || !particulars) return;
    
    setLoading(true);
    try {
      const userRef = doc(db, 'users', auth.currentUser!.uid);
      await setDoc(userRef, {
        vehicleType,
        vehicleParticulars: particulars,
        updatedAt: serverTimestamp()
      }, { merge: true });
      onComplete();
    } catch (error) {
      console.error('Failed to save vehicle info:', error);
    } finally {
      setLoading(false);
    }
  };

  const types = [
    { id: 'car', label: 'Car', icon: Car },
    { id: 'truck', label: 'Truck', icon: Truck },
    { id: 'bike', label: 'Motorcycle', icon: Bike },
  ];

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <Card className="max-w-md w-full p-8 space-y-8">
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-bold text-slate-900">Vehicle Setup</h2>
          <p className="text-slate-500">Tell us what you're driving to get tailored road alerts.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-3">
            <label className="text-sm font-medium text-slate-700">Vehicle Type</label>
            <div className="grid grid-cols-3 gap-3">
              {types.map((type) => (
                <button
                  key={type.id}
                  type="button"
                  onClick={() => setVehicleType(type.id)}
                  className={cn(
                    'flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all',
                    vehicleType === type.id 
                      ? 'border-orange-600 bg-orange-50 text-orange-600' 
                      : 'border-slate-100 bg-white text-slate-400 hover:border-slate-200'
                  )}
                >
                  <type.icon size={24} />
                  <span className="text-xs mt-2 font-medium">{type.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Vehicle Particulars</label>
            <input
              type="text"
              value={particulars}
              onChange={(e) => setParticulars(e.target.value)}
              placeholder="e.g. Plate number, Model"
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none transition-all"
              required
            />
          </div>

          <Button type="submit" className="w-full py-4" disabled={loading}>
            {loading ? 'Saving...' : 'Start Driving'}
          </Button>
        </form>
      </Card>
    </div>
  );
};

const MapBackground = ({ center, reports }: { center: [number, number], reports: RoadReport[] }) => {
  const MapUpdater = ({ center }: { center: [number, number] }) => {
    const map = useMap();
    useEffect(() => {
      map.setView(center, map.getZoom());
    }, [center, map]);
    return null;
  };

  return (
    <div className="absolute inset-0 z-0">
      <MapContainer 
        center={center} 
        zoom={13} 
        zoomControl={false}
        className="w-full h-full"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapUpdater center={center} />
        
        {/* Current Location Marker */}
        <Marker position={center} />

        {/* Report Markers */}
        {reports.map((report) => (
          <Marker 
            key={report.id} 
            position={[report.location.lat, report.location.lng]}
            icon={L.divIcon({
              className: 'custom-div-icon',
              html: `<div class="w-8 h-8 rounded-full border-2 border-white shadow-lg flex items-center justify-center text-white ${report.type === 'Hazard' ? 'bg-red-500' : 'bg-orange-500'}">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 19 9 2-9-18-9 18 9-2zm0 0v-8"/></svg>
              </div>`,
              iconSize: [32, 32],
              iconAnchor: [16, 16]
            })}
          />
        ))}
      </MapContainer>
    </div>
  );
};

const Dashboard = () => {
  const [reports, setReports] = useState<RoadReport[]>([]);
  const [isReporting, setIsReporting] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [searchQuery, setSearchQuery] = useState({ from: '', to: '' });
  const [showDirections, setShowDirections] = useState(false);
  const [bottomSheetOpen, setBottomSheetOpen] = useState(false);
  const [userLocation, setUserLocation] = useState<[number, number]>([-1.2921, 36.8219]); // Default to Nairobi

  useEffect(() => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation([position.coords.latitude, position.coords.longitude]);
        },
        (error) => {
          console.error("Error getting location:", error);
        }
      );
    }

    const q = query(collection(db, 'reports'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as RoadReport));
      setReports(data);
    });
    return () => unsubscribe();
  }, []);

  const handleReport = async (type: string, subtype?: string) => {
    const path = 'reports';
    try {
      await addDoc(collection(db, path), {
        type,
        subtype,
        location: { lat: userLocation[0], lng: userLocation[1] },
        authorUid: auth.currentUser!.uid,
        authorName: auth.currentUser!.displayName,
        createdAt: serverTimestamp()
      });
      setIsReporting(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  };

  const handleSaveRoute = async () => {
    const path = 'routes';
    try {
      await addDoc(collection(db, path), {
        from: searchQuery.from,
        to: searchQuery.to,
        path: [{ lat: userLocation[0], lng: userLocation[1] }],
        isShortcut: true,
        verified: false,
        authorUid: auth.currentUser!.uid,
        createdAt: serverTimestamp()
      });
      setIsRecording(false);
      alert('Shortcut recorded and submitted for verification!');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  };

  return (
    <div className="relative min-h-screen bg-slate-50 overflow-hidden">
      <MapBackground center={userLocation} reports={reports} />

      {/* Floating Top Bar */}
      <div className="absolute top-0 left-0 right-0 p-4 z-40 pointer-events-none">
        <div className="max-w-md mx-auto space-y-3 pointer-events-auto">
          {/* Search Bar */}
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 p-2 flex items-center gap-2">
            <button className="p-2 text-slate-500 hover:bg-slate-50 rounded-xl">
              <Menu size={20} />
            </button>
            <div className="flex-1 relative">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input 
                type="text" 
                placeholder="Search destination..." 
                className="w-full pl-10 pr-4 py-2 bg-transparent outline-none text-slate-700 font-medium"
                value={searchQuery.to}
                onChange={(e) => setSearchQuery({ ...searchQuery, to: e.target.value })}
              />
            </div>
            <div className="w-8 h-8 rounded-full bg-orange-600 flex items-center justify-center text-white text-xs font-bold">
              {auth.currentUser?.displayName?.[0]}
            </div>
          </div>

          {/* Quick Filters */}
          <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
            {['Hazards', 'Shortcuts', 'Tolls', 'Routes'].map((filter) => (
              <button 
                key={filter}
                className="px-4 py-1.5 bg-white rounded-full shadow-md border border-slate-100 text-xs font-bold text-slate-600 whitespace-nowrap hover:bg-slate-50 transition-colors"
              >
                {filter}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Floating Action Buttons */}
      <div className="absolute right-4 top-1/2 -translate-y-1/2 flex flex-col gap-3 z-30">
        <button className="w-12 h-12 bg-white rounded-2xl shadow-xl flex items-center justify-center text-slate-600 hover:bg-slate-50 transition-all border border-slate-100">
          <NavIcon size={20} />
        </button>
        <button className="w-12 h-12 bg-white rounded-2xl shadow-xl flex items-center justify-center text-slate-600 hover:bg-slate-50 transition-all border border-slate-100">
          <MapPin size={20} />
        </button>
      </div>

      {/* Bottom Sheet / Navigation */}
      <motion.div 
        initial={false}
        animate={{ height: bottomSheetOpen ? '80vh' : '180px' }}
        className="absolute bottom-0 left-0 right-0 bg-white rounded-t-[32px] shadow-[0_-8px_30px_rgb(0,0,0,0.12)] z-50 flex flex-col"
      >
        {/* Drag Handle */}
        <div 
          className="w-full py-4 flex flex-col items-center cursor-pointer"
          onClick={() => setBottomSheetOpen(!bottomSheetOpen)}
        >
          <div className="w-12 h-1.5 bg-slate-200 rounded-full mb-4" />
          <div className="px-6 w-full flex items-center justify-between">
            <div className="space-y-1">
              <h3 className="text-lg font-bold text-slate-900">Road Explorer</h3>
              <p className="text-xs text-slate-500 font-medium">{reports.length} updates nearby</p>
            </div>
            <Button 
              variant="outline" 
              size="sm" 
              className="rounded-full gap-2"
              onClick={(e) => {
                e.stopPropagation();
                setIsRecording(true);
              }}
            >
              <Plus size={16} />
              Add Route
            </Button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 pb-24 space-y-6">
          {/* Directions if searching */}
          {searchQuery.to && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-4 bg-orange-50 rounded-2xl border border-orange-100">
                <div className="w-10 h-10 rounded-xl bg-orange-600 flex items-center justify-center text-white">
                  <NavIcon size={20} />
                </div>
                <div className="flex-1">
                  <p className="text-xs font-bold text-orange-600 uppercase">Suggested Route</p>
                  <p className="text-sm font-bold text-slate-900">Via Main Highway • 24 mins</p>
                </div>
                <Button size="sm" onClick={() => setShowDirections(true)}>Go</Button>
              </div>
            </div>
          )}

          {/* Live Updates */}
          <div className="space-y-4">
            <h4 className="font-bold text-slate-900">Live Updates</h4>
            <div className="space-y-3">
              {reports.map((report) => (
                <Card key={report.id} className="p-4 flex gap-4 border-slate-50">
                  <div className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
                    report.type === 'Hazard' ? "bg-red-50 text-red-600" : "bg-orange-50 text-orange-600"
                  )}>
                    {report.type === 'Hazard' ? <AlertTriangle size={20} /> : <Info size={20} />}
                  </div>
                  <div className="flex-1">
                    <div className="flex justify-between items-start">
                      <h5 className="font-bold text-sm text-slate-900">{report.type}</h5>
                      <span className="text-[10px] text-slate-400 font-medium">2m ago</span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">{report.subtype || 'Road update reported'}</p>
                  </div>
                </Card>
              ))}
            </div>
          </div>

          {/* Donation Section */}
          <Card className="p-6 bg-gradient-to-br from-slate-900 to-slate-800 text-white space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-orange-600 flex items-center justify-center">
                <Heart size={20} />
              </div>
              <div>
                <h3 className="font-bold">Support Road Ranger</h3>
                <p className="text-xs text-slate-400">Non-profit & Open Source</p>
              </div>
            </div>
            <p className="text-sm text-slate-300">
              Road Ranger is built by drivers, for drivers. We rely on community donations.
            </p>
            <Button variant="primary" className="w-full bg-white text-slate-900 hover:bg-slate-100">
              Make a Donation
            </Button>
          </Card>
        </div>
      </motion.div>

      {/* Bottom Action Bar (Mobile Style) */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-100 px-6 py-3 z-[60] flex items-center justify-around">
        <button className="flex flex-col items-center gap-1 text-orange-600">
          <NavIcon size={24} />
          <span className="text-[10px] font-bold">Explore</span>
        </button>
        <button 
          className="flex flex-col items-center gap-1 text-slate-400 hover:text-orange-600 transition-colors"
          onClick={() => setIsReporting(true)}
        >
          <Plus size={24} />
          <span className="text-[10px] font-bold">Report</span>
        </button>
        <button className="flex flex-col items-center gap-1 text-slate-400 hover:text-orange-600 transition-colors">
          <History size={24} />
          <span className="text-[10px] font-bold">Saved</span>
        </button>
        <button className="flex flex-col items-center gap-1 text-slate-400 hover:text-orange-600 transition-colors">
          <Settings size={24} />
          <span className="text-[10px] font-bold">Settings</span>
        </button>
      </div>

      {/* Report Modal */}
      <AnimatePresence>
        {isReporting && (
          <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsReporting(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              className="relative w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl space-y-6"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold text-slate-900">Report Road Status</h3>
                <button onClick={() => setIsReporting(false)} className="p-2 hover:bg-slate-100 rounded-full">
                  <X size={20} />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {[
                  { id: 'Hazard', icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-50' },
                  { id: 'RoadBlock', icon: Shield, color: 'text-slate-600', bg: 'bg-slate-50' },
                  { id: 'TollStation', icon: MapPin, color: 'text-blue-600', bg: 'bg-blue-50' },
                  { id: 'Shortcut', icon: RouteIcon, color: 'text-green-600', bg: 'bg-green-50' },
                  { id: 'DrivingCondition', icon: Info, color: 'text-orange-600', bg: 'bg-orange-50' },
                  { id: 'Levy', icon: Heart, color: 'text-purple-600', bg: 'bg-purple-50' },
                ].map((item) => (
                  <button
                    key={item.id}
                    onClick={() => handleReport(item.id)}
                    className="flex flex-col items-center gap-2 p-4 rounded-2xl border border-slate-100 hover:border-orange-200 hover:bg-orange-50 transition-all group"
                  >
                    <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform", item.bg, item.color)}>
                      <item.icon size={20} />
                    </div>
                    <span className="text-xs font-bold text-slate-700">{item.id}</span>
                  </button>
                ))}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Recording Overlay */}
      <AnimatePresence>
        {isRecording && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed top-20 left-1/2 -translate-x-1/2 z-[60] w-full max-w-xs"
          >
            <div className="bg-slate-900 text-white px-4 py-3 rounded-2xl shadow-2xl flex items-center justify-between border border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                <div className="space-y-0.5">
                  <p className="text-xs font-bold uppercase tracking-wider opacity-60">Recording Route</p>
                  <p className="text-sm font-medium">0.4 km tracked</p>
                </div>
              </div>
              <button 
                onClick={handleSaveRoute}
                className="bg-white/10 hover:bg-white/20 p-2 rounded-lg transition-colors"
              >
                <CheckCircle2 size={18} className="text-green-400" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// --- Main App ---

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        const userRef = doc(db, 'users', firebaseUser.uid);
        const userSnap = await getDoc(userRef);
        
        if (userSnap.exists()) {
          setProfile(userSnap.data() as UserProfile);
        } else {
          // Create initial profile
          const newProfile = {
            uid: firebaseUser.uid,
            email: firebaseUser.email!,
            displayName: firebaseUser.displayName!,
            createdAt: serverTimestamp(),
          };
          await setDoc(userRef, newProfile);
          setProfile(newProfile as UserProfile);
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-12 h-12 border-4 border-orange-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <Router>
        <Routes>
          <Route 
            path="/login" 
            element={user ? <Navigate to="/" /> : <Login />} 
          />
          <Route 
            path="/" 
            element={
              !user ? <Navigate to="/login" /> : 
              !profile?.vehicleType ? <VehicleSetup onComplete={() => window.location.reload()} /> : 
              <Dashboard />
            } 
          />
        </Routes>
      </Router>
    </ErrorBoundary>
  );
}
