import React from 'react';
import { Card } from '../ui/Card';
import { MemberPresence } from './MemberPresence';
import { ActivityTimeline } from './ActivityTimeline';
import { InvitePanel } from './InvitePanel';

export const CollaborationHub: React.FC = () => (
  <div className="flex flex-col gap-4 p-4 h-full overflow-y-auto">
    <MemberPresence />
    <ActivityTimeline />
    <InvitePanel />
  </div>
);
