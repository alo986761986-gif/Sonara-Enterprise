import React from 'react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';

export const InvitePanel: React.FC = () => (
  <Card className="p-4">
    <h4 className="font-semibold text-slate-800 mb-2">Invite</h4>
    <Button size="sm" className="w-full">Invite Collaborator</Button>
  </Card>
);
