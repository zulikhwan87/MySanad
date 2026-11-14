'use client';

import { MotionConfig, motion, type Variants } from 'framer-motion';

/** Honours the OS "reduce motion" setting for every animation below it. */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: 'easeOut' } },
};

export function FadeIn({ children, className, delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  return (
    <motion.div
      className={className}
      initial="hidden"
      animate="show"
      variants={fadeUp}
      transition={{ delay }}
    >
      {children}
    </motion.div>
  );
}

export function StaggerList({ children, className, as = 'ul' }: { children: React.ReactNode; className?: string; as?: 'ul' | 'div' }) {
  const Comp = as === 'ul' ? motion.ul : motion.div;
  return (
    <Comp
      className={className}
      initial="hidden"
      animate="show"
      variants={{ hidden: {}, show: { transition: { staggerChildren: 0.06 } } }}
    >
      {children}
    </Comp>
  );
}

export function StaggerItem({ children, className, as = 'li' }: { children: React.ReactNode; className?: string; as?: 'li' | 'div' }) {
  const Comp = as === 'li' ? motion.li : motion.div;
  return (
    <Comp className={className} variants={fadeUp}>
      {children}
    </Comp>
  );
}
