import type { Feedback } from '~/../types';

type ErrorCodes =
  | 'E_INDEX_ALREADY_EXISTS'
  | 'E_CREATING_INDEX'
  | 'E_MISSING_PAGE'
  | 'E_UPDATING_PAGE'
  | 'E_MISSING_PARENT'
  | 'E_DELETING_PAGE'
  | 'E_CREATING_PAGE'
  | 'E_MISSING_DB'
  | 'E_EMPTY_TITLE'
  | 'E_EMPTY_CONTENT'
  | 'E_WRONG_PARENT_PAGE'
  | 'E_INVALID_PARENT_PAGE'
  | 'E_MISSING_PAGES_DB'
  | 'E_INVALID_VERSION'
  | 'E_MISSING_REV'
  | 'E_REV_MISMATCH_ON_SAVE'
  | 'E_UNKNOWN_ERROR'
  | 'E_MISSING_SETTINGS_DB'
  | 'E_UPDATING_SETTINGS';

type SuccessCodes =
  | 'S_PAGE_CREATED'
  | 'S_PAGE_UPDATED'
  | 'S_PAGE_DELETED'
  | 'S_PAGE_MOVED'
  | 'S_SETTINGS_UPDATED';

type AnyCode = ErrorCodes | SuccessCodes;

// Keep this as an object instead of a Map to have a really strict and tight typing
export const Feedbacks: { [key in AnyCode]: Feedback } = {
  S_PAGE_CREATED: {
    code: 1,
    message: 'Page created',
  },
  S_PAGE_UPDATED: {
    code: 2,
    message: 'Page updated',
  },
  S_PAGE_DELETED: {
    code: 3,
    message: 'Page deleted',
  },
  S_PAGE_MOVED: {
    code: 4,
    message: 'Page moved to a new parent',
  },
  S_SETTINGS_UPDATED: {
    code: 5,
    message: 'Settings updated',
  },
  E_INDEX_ALREADY_EXISTS: {
    code: 100,
    message: 'Index already exists',
  },
  E_CREATING_INDEX: {
    code: 101,
    message: 'Error creating index page',
  },
  E_MISSING_PAGE: {
    code: 102,
    message: 'Error loading the page',
  },
  E_UPDATING_PAGE: {
    code: 103,
    message: 'Error updating page',
  },
  E_MISSING_PARENT: {
    code: 105,
    message: 'Parent page not found',
  },
  E_DELETING_PAGE: {
    code: 106,
    message: 'Error deleting page',
  },
  E_CREATING_PAGE: {
    code: 107,
    message: 'Error creating page',
  },
  E_MISSING_DB: {
    code: 108,
    message: 'Database not connected or connection invalid',
  },
  E_EMPTY_TITLE: {
    code: 109,
    message: 'Title cannot be empty',
  },
  E_EMPTY_CONTENT: {
    code: 110,
    message: 'Content cannot be empty',
  },
  E_WRONG_PARENT_PAGE: {
    code: 111,
    message: 'Parent page is invalid or not found',
  },
  E_INVALID_PARENT_PAGE: {
    code: 112,
    message: 'Parent page is missing or invalid',
  },
  E_MISSING_PAGES_DB: {
    code: 113,
    message: 'Database "Pages" not found',
  },
  E_UNKNOWN_ERROR: {
    code: 114,
    message: 'An unknown error occurred',
  },
  E_INVALID_VERSION: {
    code: 116,
    message: 'Invalid version number',
  },
  E_MISSING_REV: {
    code: 117,
    message: 'Revision number is missing',
  },
  E_REV_MISMATCH_ON_SAVE: {
    code: 118,
    message:
      'Revision mismatch detected. Someone may have changed the content. Please try again.',
  },
  E_MISSING_SETTINGS_DB: {
    code: 119,
    message: 'Database "Settings" not found',
  },
  E_UPDATING_SETTINGS: {
    code: 120,
    message: 'Error updating settings',
  },
} as const;

const feedbackValues = Object.values(Feedbacks);
export const getFeedbackByCode = (code?: number) =>
  code ? feedbackValues.find((f) => f.code === code) : undefined;

export const getFeedbackKeyByCode = (code: number): string => {
  return `Feedbacks.${
    Object.entries(Feedbacks).find(
      ([_, feedback]) => feedback.code === code
    )?.[0]
  }`;
};

export const isFeedbackError = (feedback: Feedback) => feedback.code >= 100;
