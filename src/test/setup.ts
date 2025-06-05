// Optional: import jest-dom matchers
import '@testing-library/jest-dom/vitest'; // if using @testing-library/jest-dom with vitest
// or import '@testing-library/jest-dom'; // if using jest or older vitest versions

// Example: Mock global objects or functions if needed
// global.ResizeObserver = vi.fn().mockImplementation(() => ({
//   observe: vi.fn(),
//   unobserve: vi.fn(),
//   disconnect: vi.fn(),
// }));

// Clean up after each test
// import { cleanup } from '@testing-library/react';
// afterEach(() => {
//   cleanup();
// });

console.log('Vitest setup file loaded.');
