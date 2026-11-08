"use client";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type Point = { label: string; value: number; secondary?: number };

function money(v: number, currency: string, locale: string) {
  return new Intl.NumberFormat(locale === "es" ? "es-US" : "en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
    maximumFractionDigits: v >= 100000 ? 0 : 2,
  }).format(v / 100);
}

export function RevenueAreaChart({ data, currency, locale, height = 240 }: { data: Point[]; currency: string; locale: string; height?: number }) {
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2f7bff" stopOpacity={0.28} />
              <stop offset="100%" stopColor="#2f7bff" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#e6e9f0" vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#5b6577" }} minTickGap={24} />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={56}
            tick={{ fontSize: 11, fill: "#5b6577" }}
            tickFormatter={(v) => money(Number(v), currency, locale)}
          />
          <Tooltip
            cursor={{ stroke: "#2f7bff", strokeOpacity: 0.25 }}
            contentStyle={{ borderRadius: 10, border: "1px solid #e6e9f0", fontSize: 12, boxShadow: "0 8px 24px -12px rgba(5,11,26,.3)" }}
            formatter={(v) => [money(Number(v), currency, locale), ""]}
          />
          <Area type="monotone" dataKey="value" stroke="#2f7bff" strokeWidth={2} fill="url(#rev)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function SimpleBarChart({
  data,
  currency,
  locale,
  height = 240,
  isMoney = true,
}: {
  data: Point[];
  currency: string;
  locale: string;
  height?: number;
  isMoney?: boolean;
}) {
  const f = (v: number) => (isMoney ? money(v, currency, locale) : String(v));
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="#e6e9f0" vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#5b6577" }} interval={0} />
          <YAxis tickLine={false} axisLine={false} width={56} tick={{ fontSize: 11, fill: "#5b6577" }} tickFormatter={(v) => f(Number(v))} />
          <Tooltip
            cursor={{ fill: "rgba(47,123,255,0.06)" }}
            contentStyle={{ borderRadius: 10, border: "1px solid #e6e9f0", fontSize: 12 }}
            formatter={(v) => [f(Number(v)), ""]}
          />
          <Bar dataKey="value" fill="#12213f" radius={[6, 6, 0, 0]} maxBarSize={36} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
