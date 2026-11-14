'use client';

import { useState } from 'react';
import { Table2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

/** Every chart ships with a table view (accessibility + exact values). */
export function ChartCard({
  title,
  description,
  table,
  children,
  empty,
}: {
  title: string;
  description?: string;
  table: { headers: string[]; rows: Array<Array<string | number>> };
  children: React.ReactNode;
  empty?: boolean;
}) {
  const [showTable, setShowTable] = useState(false);
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div className="space-y-1">
          <CardTitle className="text-base">{title}</CardTitle>
          {description ? <CardDescription>{description}</CardDescription> : null}
        </div>
        {!empty ? (
          <Button variant="ghost" size="sm" aria-pressed={showTable} onClick={() => setShowTable((v) => !v)}>
            <Table2 aria-hidden /> {showTable ? 'Carta' : 'Jadual'}
          </Button>
        ) : null}
      </CardHeader>
      <CardContent>
        {empty ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Belum ada data.</p>
        ) : showTable ? (
          <div className="max-h-80 overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  {table.headers.map((h, i) => (
                    <th key={h} className={i === 0 ? 'py-2 pr-3' : 'py-2 pr-3 text-right'}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {table.rows.map((r) => (
                  <tr key={String(r[0])}>
                    {r.map((c, i) => (
                      <td key={i} className={i === 0 ? 'py-1.5 pr-3' : 'py-1.5 pr-3 text-right tabular-nums'}>
                        {c}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}
