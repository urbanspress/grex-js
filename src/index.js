/**
 * Grex JS v1.0.0 Public Entrypoint.
 */

export {
  signal,
  computed,
  effect,
  batch,
  untrack,
  isExactGrabWireString,
  formatGrabDecimal,
} from "./signals.js";

export {
  GrexSecurityError,
  assertSafeTag,
  isForbiddenAttribute,
  isSafeUrl,
  sanitizeAttributeValue,
  setSafeText,
} from "./security.js";

export {
  DEFAULT_BREAKPOINTS,
  ALLOWED_STYLE_PROPERTIES,
  normalizeTokenName,
  normalizeStyleProperty,
  validateTokenValue,
  applyTokens,
  compileTokenCss,
  getElementStyleClass,
  compileElementStyles,
} from "./tokens.js";

export {
  bindElement,
  renderElement,
  hydrate,
} from "./dom.js";

export {
  Section,
  Container,
  Grid,
  Stack,
  Card,
  Heading,
  Text,
  RichText,
  Link,
  Button,
  Image,
  Icon,
  ELEMENT_REGISTRY,
  registerElementType,
  renderNode,
} from "./elements.js";

export {
  Form,
  Input,
  Select,
  Tabs,
  Accordion,
  Modal,
  Nav,
  ForEach,
} from "./interactive.js";

export {
  invalidateQueries,
  connectSocketInvalidation,
  createGrabClient,
  useQuery,
  useMutation,
} from "./data.js";

export {
  createTheme,
  createClassManager,
} from "./theme.js";

export {
  parseCssColor,
  computeContrastRatio,
  auditAccessibility,
  auditDom,
} from "./a11y.js";

export {
  exportElementCatalog,
  validateElementNode,
} from "./catalog.js";

export {
  PREVIEW_CHANNEL,
  createPreviewBridge,
} from "./bridge.js";
