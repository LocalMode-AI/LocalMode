'use client';

import {
  createContext,
  useContext,
  useRef,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
  type MouseEvent,
} from 'react';

// ============================================================================
// Types & Context
// ============================================================================

interface CardInfluence {
  rotateY: number;
  glowX: number;
  intensity: number;
}

interface FeatureCard3DContextType {
  registerCard: (index: number, rect: DOMRect | null) => void;
  getExternalInfluence: (index: number) => CardInfluence | null;
  notifyHover: (index: number, mouseX: number, cardRect: DOMRect) => void;
  clearHover: () => void;
  toggleAdjacentReaction: () => void;
}

const FeatureCard3DContext = createContext<FeatureCard3DContextType | null>(null);

// Edge threshold as percentage of card width (how close to edge to trigger neighbor)
const EDGE_THRESHOLD = 0.25;
// Maximum influence when at the very edge
const MAX_INFLUENCE_ROTATION = 8;

// ============================================================================
// Grid Container Component
// ============================================================================

interface FeatureCard3DGridProps {
  children: ReactNode;
  className?: string;
  columns?: number;
  /** Initial state for adjacent card reaction. Defaults to false. Double-click any card to toggle. */
  defaultEnableAdjacentReaction?: boolean;
}

export function FeatureCard3DGrid({
  children,
  className = '',
  columns = 5,
  defaultEnableAdjacentReaction = false,
}: FeatureCard3DGridProps) {
  const cardRects = useRef<Map<number, DOMRect>>(new Map());
  const [enableAdjacentReaction, setEnableAdjacentReaction] = useState(
    defaultEnableAdjacentReaction
  );
  const [hoverState, setHoverState] = useState<{
    cardIndex: number;
    normalizedX: number; // 0-1 where 0 is left edge, 1 is right edge
  } | null>(null);

  const toggleAdjacentReaction = useCallback(() => {
    setEnableAdjacentReaction((prev) => !prev);
  }, []);

  const registerCard = useCallback((index: number, rect: DOMRect | null) => {
    if (rect) {
      cardRects.current.set(index, rect);
    } else {
      cardRects.current.delete(index);
    }
  }, []);

  const notifyHover = useCallback((index: number, mouseX: number, cardRect: DOMRect) => {
    const normalizedX = (mouseX - cardRect.left) / cardRect.width;
    setHoverState({ cardIndex: index, normalizedX });
  }, []);

  const clearHover = useCallback(() => {
    setHoverState(null);
  }, []);

  const getExternalInfluence = useCallback(
    (index: number): CardInfluence | null => {
      if (!enableAdjacentReaction || !hoverState) return null;

      const { cardIndex: hoveredIndex, normalizedX } = hoverState;

      // Check if this card should be influenced by the hovered card
      // Card on the right of hovered card (hoveredIndex + 1)
      if (index === hoveredIndex + 1) {
        // Influence from left when hover is near right edge
        const distanceFromRightEdge = 1 - normalizedX;
        if (distanceFromRightEdge < EDGE_THRESHOLD) {
          const intensity = 1 - distanceFromRightEdge / EDGE_THRESHOLD;
          return {
            rotateY: -MAX_INFLUENCE_ROTATION * intensity * 0.6,
            glowX: intensity * 15, // Glow starts from left edge
            intensity,
          };
        }
      }

      // Card on the left of hovered card (hoveredIndex - 1)
      if (index === hoveredIndex - 1) {
        // Influence from right when hover is near left edge
        if (normalizedX < EDGE_THRESHOLD) {
          const intensity = 1 - normalizedX / EDGE_THRESHOLD;
          return {
            rotateY: MAX_INFLUENCE_ROTATION * intensity * 0.6,
            glowX: 100 - intensity * 15, // Glow starts from right edge
            intensity,
          };
        }
      }

      // For grid layout, also check row-based neighbors
      // Card below the hovered card in the same column
      if (index === hoveredIndex + columns) {
        // This would need vertical influence - skipping for now
        return null;
      }

      return null;
    },
    [enableAdjacentReaction, hoverState, columns]
  );

  const contextValue: FeatureCard3DContextType = {
    registerCard,
    getExternalInfluence,
    notifyHover,
    clearHover,
    toggleAdjacentReaction,
  };

  return (
    <FeatureCard3DContext.Provider value={contextValue}>
      <div className={className}>{children}</div>
    </FeatureCard3DContext.Provider>
  );
}

// ============================================================================
// Individual Card Component
// ============================================================================

interface FeatureCard3DProps {
  icon: ReactNode;
  stat: string;
  title: string;
  description: string;
  color: string;
  animationDelay?: number;
  index?: number; // Used for neighbor detection
}

export function FeatureCard3D({
  icon,
  stat,
  title,
  description,
  color,
  animationDelay = 0,
  index = 0,
}: FeatureCard3DProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [transform, setTransform] = useState('');
  const [glowPosition, setGlowPosition] = useState({ x: 50, y: 50 });
  const [isHovering, setIsHovering] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [externalInfluence, setExternalInfluence] = useState<CardInfluence | null>(null);

  const context = useContext(FeatureCard3DContext);

  // Register card rect on mount and resize
  useEffect(() => {
    const updateRect = () => {
      if (cardRef.current && context) {
        context.registerCard(index, cardRef.current.getBoundingClientRect());
      }
    };

    updateRect();
    window.addEventListener('resize', updateRect);
    window.addEventListener('scroll', updateRect);

    return () => {
      window.removeEventListener('resize', updateRect);
      window.removeEventListener('scroll', updateRect);
      context?.registerCard(index, null);
    };
  }, [index, context]);

  // Poll for external influence
  useEffect(() => {
    if (!context) return;

    const checkInfluence = () => {
      const influence = context.getExternalInfluence(index);
      setExternalInfluence(influence);
    };

    const interval = setInterval(checkInfluence, 16); // ~60fps
    return () => clearInterval(interval);
  }, [context, index]);

  // Apply external influence when not hovering
  useEffect(() => {
    if (isHovering || isAnimating || !externalInfluence) {
      if (!isHovering && !isAnimating && !externalInfluence) {
        // Reset when no influence and not hovering
        setTransform('perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)');
        setGlowPosition({ x: 50, y: 50 });
      }
      return;
    }

    const { rotateY, glowX, intensity } = externalInfluence;
    const scale = 1 + 0.02 * intensity;
    setTransform(
      `perspective(1000px) rotateX(0deg) rotateY(${rotateY}deg) scale3d(${scale}, ${scale}, ${scale})`
    );
    setGlowPosition({ x: glowX, y: 50 });
  }, [externalInfluence, isHovering, isAnimating]);

  // Initial animation effect
  useEffect(() => {
    const startDelay = 500 + animationDelay;
    const animationDuration = 600;

    const startTimer = setTimeout(() => {
      setIsAnimating(true);
      setGlowPosition({ x: 0, y: 50 });

      let startTime: number;
      const animate = (timestamp: number) => {
        if (!startTime) startTime = timestamp;
        const progress = (timestamp - startTime) / animationDuration;

        if (progress < 1) {
          const eased = 1 - Math.pow(1 - progress, 3);
          setGlowPosition({ x: eased * 100, y: 50 });
          setTransform(
            `perspective(1000px) rotateX(0deg) rotateY(${8 - eased * 16}deg) scale3d(1.02, 1.02, 1.02)`
          );
          requestAnimationFrame(animate);
        } else {
          setGlowPosition({ x: 100, y: 50 });
        }
      };

      requestAnimationFrame(animate);
    }, startDelay);

    const endTimer = setTimeout(
      () => {
        setIsAnimating(false);
        setTransform('perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)');
        setGlowPosition({ x: 50, y: 50 });
      },
      startDelay + animationDuration + 100
    );

    return () => {
      clearTimeout(startTimer);
      clearTimeout(endTimer);
    };
  }, [animationDelay]);

  const isActive = isHovering || isAnimating || (externalInfluence?.intensity ?? 0) > 0.3;
  const isPartiallyActive = (externalInfluence?.intensity ?? 0) > 0;

  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current || isAnimating) return;

    const rect = cardRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    const rotateX = ((y - centerY) / centerY) * -12;
    const rotateY = ((x - centerX) / centerX) * 12;

    setTransform(
      `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.02, 1.02, 1.02)`
    );
    setGlowPosition({ x: (x / rect.width) * 100, y: (y / rect.height) * 100 });

    // Notify context about hover position for neighbor influence
    context?.notifyHover(index, e.clientX, rect);
  };

  const handleMouseEnter = () => {
    if (!isAnimating) setIsHovering(true);
  };

  const handleMouseLeave = () => {
    setTransform('perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)');
    setGlowPosition({ x: 50, y: 50 });
    setIsHovering(false);
    context?.clearHover();
  };

  const handleDoubleClick = () => {
    context?.toggleAdjacentReaction();
  };

  // Calculate opacity based on active state and external influence
  const activeOpacity = isActive ? 1 : isPartiallyActive ? externalInfluence!.intensity * 0.7 : 0;

  return (
    <div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onDoubleClick={handleDoubleClick}
      className="relative cursor-pointer"
      style={{
        transform: transform || 'perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)',
        transition:
          isHovering || isAnimating
            ? 'transform 0.1s ease-out'
            : externalInfluence
              ? 'transform 0.15s ease-out'
              : 'transform 0.4s cubic-bezier(0.23, 1, 0.32, 1)',
        transformStyle: 'preserve-3d',
      }}
    >
      {/* Animated glow border */}
      <div
        className="absolute -inset-px rounded-xl transition-opacity duration-300"
        style={{
          opacity: activeOpacity,
          background: `radial-gradient(circle at ${glowPosition.x}% ${glowPosition.y}%, ${color}80 0%, transparent 60%)`,
          filter: 'blur(4px)',
        }}
      />

      {/* Card content */}
      <div
        className="relative p-6 rounded-xl backdrop-blur-sm flex flex-col items-center text-center gap-2 overflow-hidden transition-all duration-300"
        style={{
          border: `1px solid ${isActive || isPartiallyActive ? color + '60' : color + '33'}`,
          background: isActive ? color + '1A' : isPartiallyActive ? color + '10' : color + '0D',
          boxShadow:
            isActive || isPartiallyActive
              ? `0 20px 40px -15px ${color}40, 0 0 20px ${color}20`
              : 'none',
          transformStyle: 'preserve-3d',
        }}
      >
        {/* Moving shine effect */}
        <div
          className="absolute inset-0 transition-opacity duration-300 pointer-events-none"
          style={{
            opacity: activeOpacity,
            background: `radial-gradient(circle at ${glowPosition.x}% ${glowPosition.y}%, rgba(255,255,255,0.2) 0%, transparent 40%)`,
          }}
        />

        {/* Floating particles background */}
        <div
          className="absolute inset-0 overflow-hidden pointer-events-none transition-opacity duration-500"
          style={{ opacity: isActive ? 0.6 : 0 }}
        >
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="absolute w-1 h-1 rounded-full animate-float"
              style={{
                background: color,
                left: `${15 + i * 15}%`,
                top: `${20 + (i % 3) * 25}%`,
                animationDelay: `${i * 0.3}s`,
                animationDuration: `${2 + (i % 2)}s`,
              }}
            />
          ))}
        </div>

        {/* Icon with 3D pop and glow effect */}
        <div
          className="mb-2 transition-all duration-300"
          style={{
            transform: isActive
              ? 'translateZ(40px) scale(1.15)'
              : isPartiallyActive
                ? `translateZ(${20 * externalInfluence!.intensity}px) scale(${1 + 0.075 * externalInfluence!.intensity})`
                : 'translateZ(0) scale(1)',
            filter: isActive ? `drop-shadow(0 0 12px ${color})` : 'none',
            transformStyle: 'preserve-3d',
          }}
        >
          {icon}
        </div>

        {/* Stat with 3D effect */}
        <div
          className="text-2xl font-bold text-white transition-all duration-300"
          style={{
            transform: isActive
              ? 'translateZ(25px) scale(1.05)'
              : isPartiallyActive
                ? `translateZ(${12 * externalInfluence!.intensity}px)`
                : 'translateZ(0)',
            textShadow: isActive ? `0 0 20px ${color}80` : 'none',
            transformStyle: 'preserve-3d',
          }}
        >
          {stat}
        </div>

        {/* Title */}
        <div
          className="font-semibold transition-all duration-300"
          style={{
            transform: isActive
              ? 'translateZ(18px)'
              : isPartiallyActive
                ? `translateZ(${9 * externalInfluence!.intensity}px)`
                : 'translateZ(0)',
            color: isActive ? '#ffffff' : 'var(--color-poster-text-sub)',
            transformStyle: 'preserve-3d',
          }}
        >
          {title}
        </div>

        {/* Description */}
        <div
          className="text-xs transition-all duration-300"
          style={{
            transform: isActive
              ? 'translateZ(12px)'
              : isPartiallyActive
                ? `translateZ(${6 * externalInfluence!.intensity}px)`
                : 'translateZ(0)',
            color: isActive
              ? 'rgba(255,255,255,0.7)'
              : 'rgba(var(--color-poster-text-sub-rgb, 148,163,184),0.6)',
            transformStyle: 'preserve-3d',
          }}
        >
          {description}
        </div>

        {/* Animated bottom line */}
        <div
          className="absolute bottom-0 left-1/2 h-[2px] transition-all duration-500 ease-out"
          style={{
            width: isActive
              ? '80%'
              : isPartiallyActive
                ? `${40 * externalInfluence!.intensity}%`
                : '0%',
            transform: 'translateX(-50%)',
            background: `linear-gradient(90deg, transparent, ${color}, transparent)`,
          }}
        />

        {/* Corner accents */}
        <div
          className="absolute top-0 left-0 w-6 h-6 transition-all duration-300"
          style={{
            opacity: activeOpacity,
            borderTop: `2px solid ${color}`,
            borderLeft: `2px solid ${color}`,
            borderTopLeftRadius: '12px',
          }}
        />
        <div
          className="absolute top-0 right-0 w-6 h-6 transition-all duration-300"
          style={{
            opacity: activeOpacity,
            borderTop: `2px solid ${color}`,
            borderRight: `2px solid ${color}`,
            borderTopRightRadius: '12px',
          }}
        />
      </div>
    </div>
  );
}
