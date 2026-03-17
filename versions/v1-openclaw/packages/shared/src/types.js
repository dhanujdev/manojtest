// Shared enums/constants (keep runtime values here)

export const PortalTypes = /** @type {const} */ ({
  greenhouse: 'greenhouse',
  unknown: 'unknown'
});

export const JobStates = /** @type {const} */ ({
  NEW: 'NEW',
  OPENED: 'OPENED',
  FORM_DETECTED: 'FORM_DETECTED',
  FILLING: 'FILLING',
  NEEDS_USER_INPUT: 'NEEDS_USER_INPUT',
  READY_TO_SUBMIT: 'READY_TO_SUBMIT',
  SUBMITTED: 'SUBMITTED',
  FAILED: 'FAILED'
});
