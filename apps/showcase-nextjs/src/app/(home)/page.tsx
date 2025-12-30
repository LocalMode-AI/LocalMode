import {
  Sparkles,
  Shield,
  WifiOff,
  Zap,
  Lock,
  Text,
  Eye,
  MessageSquare,
  Mic,
  Search as SearchIcon,
  CircleOff,
} from 'lucide-react';
import { AppCard } from './_components/app-card';
import { DeviceStats } from './_components/device-stats';
import { FeatureCard3D, FeatureCard3DGrid } from './_components/feature-card-3d';
import { Footer } from './_components/footer';
import { apps } from './_lib/constants';
import { CATEGORIES } from './_lib/types';

export default function HomePage() {
  const categories = Object.values(CATEGORIES);

  // Group apps by category
  const groupedApps = categories.reduce(
    (acc, category) => {
      acc[category] = apps.filter((app) => app.category === category);
      return acc;
    },
    {} as Record<string, typeof apps>
  );

  // Helper to get icon for category
  const getCategoryIcon = (category: string) => {
    switch (category) {
      case CATEGORIES.TEXT_NLP:
        return <Text className="w-5 h-5" />;
      case CATEGORIES.VISION:
        return <Eye className="w-5 h-5" />;
      case CATEGORIES.CHAT:
        return <MessageSquare className="w-5 h-5" />;
      case CATEGORIES.AUDIO:
        return <Mic className="w-5 h-5" />;
      case CATEGORIES.RAG:
        return <SearchIcon className="w-5 h-5" />;
      default:
        return <Sparkles className="w-5 h-5" />;
    }
  };

  // Helper to get color for category
  const getCategoryColor = (category: string) => {
    switch (category) {
      case CATEGORIES.TEXT_NLP:
        return 'text-poster-primary';
      case CATEGORIES.VISION:
        return 'text-poster-accent-pink';
      case CATEGORIES.CHAT:
        return 'text-poster-accent-teal';
      case CATEGORIES.AUDIO:
        return 'text-poster-accent-purple';
      case CATEGORIES.RAG:
        return 'text-poster-accent-orange';
      default:
        return 'text-poster-text-sub';
    }
  };

  return (
    <div className="min-h-screen bg-poster-bg text-poster-text-main font-sans selection:bg-poster-primary/30 relative overflow-hidden">
      {/* Background Grid Pattern with 3D depth */}
      <div className="bg-grid fixed inset-0 z-0 pointer-events-none opacity-70" />

      {/* Additional gradient overlay for depth */}
      <div className="fixed inset-0 z-0 pointer-events-none bg-linear-to-b from-poster-primary/5 via-transparent to-poster-accent-purple/5" />

      {/* Content Container */}
      <div className="relative z-10 container mx-auto px-4 py-12 lg:py-20 max-w-7xl flex flex-col gap-16">
        {/* Header Section */}
        <header className="text-center space-y-8 animate-fadeIn">
          <div className="space-y-2">
            <h1 className="text-5xl font-bold tracking-tight sm:text-6xl md:text-7xl lg:text-8xl leading-none">
              Local<span className="text-poster-primary">Mode</span>
            </h1>
            <h4 className="mx-auto max-w-2xl text-lg text-poster-text-sub/80 md:text-xl leading-relaxed">
              Complete AI suite running 100% locally in your browser
            </h4>
          </div>
        </header>

        {/* Feature Cards Section */}
        <FeatureCard3DGrid
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 animate-fadeIn"
          columns={5}
          defaultEnableAdjacentReaction={false}
        >
          <FeatureCard3D
            index={0}
            icon={<Shield className="w-8 h-8 text-poster-primary" />}
            stat="100%"
            title="Private"
            description="Zero data leaves device"
            color="#3b82f6"
            animationDelay={0}
          />

          <FeatureCard3D
            index={1}
            icon={<Zap className="w-8 h-8 text-poster-accent-teal" />}
            stat="0ms"
            title="Network Latency"
            description="After initial model load"
            color="#14b8a6"
            animationDelay={150}
          />

          <FeatureCard3D
            index={2}
            icon={<WifiOff className="w-8 h-8 text-poster-accent-purple" />}
            stat="Offline"
            title="Fully Capable"
            description="No internet required"
            color="#8b5cf6"
            animationDelay={300}
          />

          <FeatureCard3D
            index={3}
            icon={<Lock className="w-8 h-8 text-poster-accent-orange" />}
            stat="Secure"
            title="Local Storage"
            description="Encrypted on-device"
            color="#f97316"
            animationDelay={450}
          />

          <FeatureCard3D
            index={4}
            icon={<CircleOff className="w-8 h-8 text-poster-accent-pink" />}
            stat="Zero"
            title="Cost & APIs"
            description="No cost, no API keys"
            color="#ec4899"
            animationDelay={600}
          />
        </FeatureCard3DGrid>

        {/* Categorized App Grid */}
        <div className="space-y-12">
          {categories.map((category) => {
            const categoryApps = groupedApps[category];
            if (!categoryApps || categoryApps.length === 0) return null;

            return (
              <div key={category} className="space-y-6 pb-6">
                <div className="flex items-center gap-3 border-b border-white/5 pb-4">
                  <div className={`p-2 rounded-lg bg-white/5 ${getCategoryColor(category)}`}>
                    {getCategoryIcon(category)}
                  </div>
                  <h2 className="text-2xl font-bold text-poster-text-main">{category}</h2>
                  <span className="text-sm font-medium text-poster-text-sub/40 bg-white/5 px-2 py-0.5 rounded-full">
                    {categoryApps.length}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {categoryApps.map((app) => (
                    <AppCard key={app.id} app={app} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Device & Browser Stats */}
        <div className="mt-12">
          <DeviceStats />
        </div>
      </div>

      <div className="relative z-10">
        <Footer />
      </div>
    </div>
  );
}
