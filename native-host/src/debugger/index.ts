/**
 * JavaScript Macro Debugger Module
 *
 * Exports all debugger components for the iMacros JavaScript debugging feature.
 */

export {
  JSDebugger,
  DebuggerState,
  StepType,
  type StackFrame,
  type ScopeInfo,
  type VariableValue,
  type PauseEventData,
  type DebuggerConfig,
  type IimInterface,
  type ExecutionResult,
} from './js-debugger';

export {
  BreakpointManager,
  type Breakpoint,
  type BreakpointOptions,
  type BreakpointHitResult,
} from './breakpoint-manager';

export {
  CodeInstrumenter,
  type SourceLocation,
  type InstrumentOptions,
  type InstrumentResult,
  type FunctionInfo,
  type SyntaxValidationError,
} from './code-instrumenter';
