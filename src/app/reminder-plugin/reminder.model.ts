import { IEvent } from '@c8y/client';

export const REMINDER_TYPE = 'c8y_Reminder';
export const REMINDER_INITIAL_QUERY_SIZE = 100;
export const REMINDER_DRAWER_OPEN_CLASS = 'drawerOpen';
export const REMINDER_MAIN_HEADER_CLASS = 'app-main-header';
export const REMINDER_MAX_COUNTER = 10;
export const REMINDER_TEXT_LENGTH = 100;
export const REMINDER_TENENAT_OPTION_CATEGORY = 'c8y.reminder';
export const REMINDER_TENENAT_OPTION_TYPE_KEY = 'types';

export const ReminderGroupStatus = {
  due: 'DUE',
  upcoming: 'UPCOMING',
  cleared: 'CLEARED',
};
export type ReminderGroupStatus = (typeof ReminderGroupStatus)[keyof typeof ReminderGroupStatus];

export const ReminderStatus = {
  active: 'ACTIVE',
  acknowledged: 'ACKNOWLEDGED',
  cleared: 'CLEARED',
};
export type ReminderStatus = (typeof ReminderStatus)[keyof typeof ReminderStatus];

export interface Reminder extends IEvent {
  status: ReminderStatus;
  isGroup?: object;
  diff?: number;
  isCleared?: object;
  reminderType?: ReminderType['id'];
}

export interface ReminderGroup {
  status: ReminderGroupStatus;
  reminders: Reminder[];
  count: number;
}

export interface ReminderType {
  id: string;
  name: string;
}
