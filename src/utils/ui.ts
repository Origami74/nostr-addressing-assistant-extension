/**
 * UI utilities for generating colors and visual elements
 */

/**
 * Generates a consistent color based on a domain string
 * @param domain The domain to generate a color for
 * @returns A CSS HSL color string
 */
export function generateColorFromDomain(domain: string): string {
  // Simple hash function to generate a color from the domain
  let hash = 0;
  for (let i = 0; i < domain.length; i++) {
    hash = domain.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  // Convert hash to HSL color
  const hue = Math.abs(hash % 360);
  return `hsl(${hue}, 70%, 50%)`;
} 