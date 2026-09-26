/**
 * The icon set, in one place.
 *
 * Phosphor, imported from its SSR entry point so the same icons work in server
 * and client components. Everything is drawn at a single weight and a single
 * optical size — an icon set reads as designed when it is consistent, and as
 * clip-art when every glyph comes from somewhere different.
 *
 * `regular` is the working weight; `duotone` appears only where an icon is the
 * subject rather than a label, which is a handful of places.
 */
export {
  // navigation and chrome
  Compass,
  MagnifyingGlass,
  SlidersHorizontal,
  Gauge,
  SignOut,
  User,
  CaretRight,
  CaretLeft,
  CaretDown,
  ArrowRight,
  ArrowLeft,
  CaretUp,
  X,
  Plus,
  DotsThree,
  List,
  SquaresFour,
  ArrowUpRight,
  Keyboard,
  EnvelopeSimple,
  LockSimple,

  // theme
  Sun,
  Moon,
  Monitor,

  // the domain
  Exam,
  Books,
  GraduationCap,
  Stack,
  ListNumbers,
  Timer,
  Clock,
  ClockCountdown,
  Hourglass,
  Pause,
  ListChecks,
  Target,
  Lightning,
  TrendDown,
  Question,
  BookOpenText,
  Notebook,
  SealCheck,
  PencilSimpleLine,
  Printer,
  Play,
  Check,
  CheckCircle,
  XCircle,
  MinusCircle,
  Flag,
  BookmarkSimple,
  ChatCircleText,
  Warning,
  WarningCircle,
  Info,
  Lightbulb,
  VideoCamera,
  Function as FunctionIcon,
  Table,
  Code,
  TreeStructure,
  ChartBar,
  Image as ImageIcon,
  Database,

  // admin
  Upload,
  Tree,
  FileText,
  Queue,
  ShieldCheck,
  Trash,
  Eye,
  EyeSlash,
  FloppyDisk,
  ArrowCounterClockwise,
  Sparkle,
} from '@phosphor-icons/react/ssr'
