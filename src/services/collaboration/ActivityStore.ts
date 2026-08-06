import { ActivityEvent } from './ActivityTypes';

export class ActivityStore {
  private activities: ActivityEvent[] = [];

  getActivities(): ActivityEvent[] {
    return this.activities;
  }

  addActivity(activity: ActivityEvent) {
    this.activities.unshift(activity);
  }
}

export const activityStore = new ActivityStore();
