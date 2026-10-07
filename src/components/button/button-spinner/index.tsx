import { LoaderCircle } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";

export function ButtonSpinner() {
  const reducedMotion = useReducedMotion();

  return (
    <motion.span
      animate={reducedMotion ? undefined : { rotate: 360 }}
      aria-hidden="true"
      className="inline-flex size-(--spacing-icon-sm) shrink-0"
      transition={{ duration: 0.75, ease: "linear", repeat: Infinity }}
    >
      <LoaderCircle className="size-full" focusable="false" />
    </motion.span>
  );
}
