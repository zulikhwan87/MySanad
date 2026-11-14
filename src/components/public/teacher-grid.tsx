import { StaggerItem, StaggerList } from '@/components/motion/motion';
import { TeacherCard } from './teacher-card';
import type { TeacherSearchResult } from '@/types/public';

export function TeacherGrid({ teachers }: { teachers: TeacherSearchResult[] }) {
  return (
    <StaggerList className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {teachers.map((t) => (
        <StaggerItem key={t.id}>
          <TeacherCard teacher={t} />
        </StaggerItem>
      ))}
    </StaggerList>
  );
}
