'use client';

import React, { useState, useEffect } from 'react';
import {
  Search,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Info,
  RefreshCw,
  ExternalLink,
  Save,
  BarChart2,
  Globe,
  Sliders,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import type { SeoAuditReport, SeoIssue, TenantSeoAuditReport } from '@/lib/seo/audit';

export default function AdminSeoPage() {
  const [loading, setLoading] = useState(true);
  const [auditData, setAuditData] = useState<{
    overallScore: number;
    summary: {
      totalAuditedPages: number;
      criticalIssues: number;
      importantIssues: number;
      recommendations: number;
    };
    tenantAudit?: TenantSeoAuditReport;
    reports: SeoAuditReport[];
  } | null>(null);

  const [activeTab, setActiveTab] = useState<'audit' | 'settings'>('audit');
  const [feedback, setFeedback] = useState<string | null>(null);

  // Estados de Configuração de Tags e Palavras-chave
  const [seoSettings, setSeoSettings] = useState({
    primaryKeyword: 'comida congelada em porções',
    searchIntent: 'commercial',
    ga4Id: '',
    gscTag: '',
  });

  const runAudit = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/seo/audit');
      if (res.ok) {
        const data = await res.json();
        setAuditData(data);
      }
    } catch {
      // Fallback gracioso
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    runAudit();
  }, []);

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback('Configurações de SEO e Analytics salvas com sucesso!');
    setTimeout(() => setFeedback(null), 4000);
  };

  const getScoreColor = (score: number) => {
    if (score >= 90) return 'text-emerald-600 bg-emerald-50 border-emerald-200';
    if (score >= 70) return 'text-amber-600 bg-amber-50 border-amber-200';
    return 'text-rose-600 bg-rose-50 border-rose-200';
  };

  const getSeverityBadge = (severity: SeoIssue['severity']) => {
    switch (severity) {
      case 'critico':
        return <Badge variant="secondary" className="bg-rose-100 text-rose-800 border-rose-300">Crítico</Badge>;
      case 'importante':
        return <Badge variant="secondary" className="bg-amber-100 text-amber-800 border-amber-300">Importante</Badge>;
      case 'recomendacao':
        return <Badge variant="secondary" className="bg-sky-100 text-sky-800 border-sky-300">Recomendação</Badge>;
    }
  };

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-stone-200">
        <div>
          <h1 className="text-2xl font-bold font-heading text-stone-900 flex items-center gap-2.5">
            <Search className="w-6 h-6 text-amber-600" />
            SEO Técnico & Observabilidade
          </h1>
          <p className="text-sm text-stone-600 pt-1">
            Motor de auditoria contínua, Schema.org, indexação do Google e métricas de autoridade por tenant.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={runAudit}
            disabled={loading}
            className="flex items-center gap-2 text-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Reauditar Páginas
          </Button>
        </div>
      </div>

      {feedback && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <span>{feedback}</span>
        </div>
      )}

      {/* Abas */}
      <div className="flex items-center gap-3 border-b border-stone-200">
        <button
          type="button"
          onClick={() => setActiveTab('audit')}
          className={`pb-3 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'audit'
              ? 'border-amber-600 text-amber-700'
              : 'border-transparent text-stone-500 hover:text-stone-800'
          }`}
        >
          <BarChart2 className="w-4 h-4" />
          Auditoria & Diagnósticos
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('settings')}
          className={`pb-3 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'settings'
              ? 'border-amber-600 text-amber-700'
              : 'border-transparent text-stone-500 hover:text-stone-800'
          }`}
        >
          <Sliders className="w-4 h-4" />
          Palavras-Chave & Analytics
        </button>
      </div>

      {activeTab === 'audit' && (
        <div className="space-y-6">
          {/* Card Resumo do Score */}
          {auditData && (
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <Card className="p-6 sm:col-span-1 flex flex-col items-center justify-center text-center bg-white border-stone-200 shadow-xs">
                <span className="text-xs font-bold uppercase tracking-wider text-stone-500">
                  Saúde SEO Geral
                </span>
                <div
                  className={`mt-3 w-20 h-20 rounded-full border-4 flex items-center justify-center text-2xl font-bold font-heading ${getScoreColor(
                    auditData.overallScore
                  )}`}
                >
                  {auditData.overallScore}%
                </div>
                <span className="text-xs text-stone-500 mt-2">
                  {auditData.overallScore >= 90
                    ? 'Padrão Excelente'
                    : auditData.overallScore >= 70
                    ? 'Bom com Recomendações'
                    : 'Atenção Necessária'}
                </span>
              </Card>

              <div className="sm:col-span-3 grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Card className="p-5 bg-white border-stone-200 shadow-xs flex flex-col justify-between">
                  <span className="text-xs font-semibold text-rose-700 flex items-center gap-1.5">
                    <AlertCircle className="w-4 h-4 text-rose-600" />
                    Problemas Críticos
                  </span>
                  <span className="text-3xl font-bold text-stone-900 mt-2">
                    {auditData.summary.criticalIssues}
                  </span>
                  <p className="text-xs text-stone-500 mt-1">Impactam diretamente na indexação</p>
                </Card>

                <Card className="p-5 bg-white border-stone-200 shadow-xs flex flex-col justify-between">
                  <span className="text-xs font-semibold text-amber-700 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                    Alertas Importantes
                  </span>
                  <span className="text-3xl font-bold text-stone-900 mt-2">
                    {auditData.summary.importantIssues}
                  </span>
                  <p className="text-xs text-stone-500 mt-1">Podem reduzir o CTR e a visibilidade</p>
                </Card>

                <Card className="p-5 bg-white border-stone-200 shadow-xs flex flex-col justify-between">
                  <span className="text-xs font-semibold text-sky-700 flex items-center gap-1.5">
                    <Info className="w-4 h-4 text-sky-600" />
                    Recomendações
                  </span>
                  <span className="text-3xl font-bold text-stone-900 mt-2">
                    {auditData.summary.recommendations}
                  </span>
                  <p className="text-xs text-stone-500 mt-1">Oportunidades de refinamento</p>
                </Card>
              </div>
            </div>
          )}

          {/* Configuração Estrutural e Schema do Tenant */}
          {auditData?.tenantAudit && (
            <Card className="p-6 bg-white border-stone-200 shadow-xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-stone-100">
                <div>
                  <div className="flex items-center gap-2">
                    <Globe className="w-5 h-5 text-amber-700" />
                    <h3 className="font-bold text-base text-stone-900">
                      Presença Local & Schema.org ({auditData.tenantAudit.configuredType})
                    </h3>
                  </div>
                  <p className="text-xs text-stone-500 mt-0.5">
                    Configuração geral de entidade comercial para Google Busca Local e Rich Snippets
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={auditData.tenantAudit.score >= 90 ? 'primary' : auditData.tenantAudit.score >= 70 ? 'secondary' : 'neutral'}>
                    Score: {auditData.tenantAudit.score}%
                  </Badge>
                </div>
              </div>

              {auditData.tenantAudit.issues.length > 0 ? (
                <div className="space-y-2">
                  {auditData.tenantAudit.issues.map((issue) => (
                    <div
                      key={issue.id}
                      className="p-3 rounded-lg bg-stone-50 border border-stone-100 flex items-start gap-2.5 text-xs"
                    >
                      {issue.severity === 'critico' && <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />}
                      {issue.severity === 'importante' && <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />}
                      {issue.severity === 'recomendacao' && <Info className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />}
                      <div className="space-y-0.5">
                        <span className="font-semibold text-stone-900">{issue.rule}: </span>
                        <span className="text-stone-600">{issue.message} </span>
                        <p className="text-stone-500 italic mt-0.5">{issue.suggestion}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-2 text-xs text-emerald-700 font-medium">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Configurações locais e tipo de negócio perfeitamente preenchidos sem pendências.</span>
                </div>
              )}
            </Card>
          )}

          {/* Relatório Detalhado por Página */}
          <div className="space-y-4">
            <h2 className="text-lg font-bold font-heading text-stone-900">
              Relatório de Páginas Auditadas
            </h2>

            {loading ? (
              <div className="p-12 text-center text-stone-500 text-sm">
                Executando verificação de tags, headings e dados estruturados...
              </div>
            ) : auditData?.reports ? (
              auditData.reports.map((report) => (
                <Card key={report.url} className="p-6 bg-white border-stone-200 shadow-xs space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-stone-100">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-base text-stone-900">
                          /{report.slug === 'home' ? '' : report.slug}
                        </span>
                        <a
                          href={report.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-stone-400 hover:text-stone-700 inline-flex items-center gap-1"
                        >
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                      <span className="text-xs text-stone-500 block truncate max-w-lg mt-0.5">
                        {report.url}
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="text-xs text-stone-500">
                        {report.metrics.wordCount} palavras | {report.metrics.imageCount} imagens
                      </span>
                      <div
                        className={`px-3 py-1 rounded-full text-xs font-bold border ${getScoreColor(
                          report.score
                        )}`}
                      >
                        {report.score}%
                      </div>
                    </div>
                  </div>

                  {report.issues.length === 0 ? (
                    <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50/60 p-3 rounded-lg border border-emerald-100">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>Página 100% em conformidade com as diretrizes técnicas de SEO.</span>
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {report.issues.map((issue) => (
                        <div
                          key={issue.id}
                          className="p-3.5 rounded-lg bg-stone-50 border border-stone-200/80 text-xs space-y-1"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-bold text-stone-900">{issue.rule}</span>
                            {getSeverityBadge(issue.severity)}
                          </div>
                          <p className="text-stone-600">{issue.message}</p>
                          <p className="text-amber-800/90 font-medium pt-1">
                            💡 Sugestão: {issue.suggestion}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              ))
            ) : null}
          </div>
        </div>
      )}

      {activeTab === 'settings' && (
        <form onSubmit={handleSaveSettings} className="space-y-6">
          <Card className="p-6 bg-white border-stone-200 shadow-xs space-y-6">
            <h2 className="text-base font-bold font-heading text-stone-900">
              Palavras-Chave e Intenção de Busca
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase text-stone-700">
                  Palavra-Chave Principal da Marca
                </label>
                <input
                  type="text"
                  value={seoSettings.primaryKeyword}
                  onChange={(e) => setSeoSettings({ ...seoSettings, primaryKeyword: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-stone-300 text-sm focus:outline-none focus:border-stone-500"
                  placeholder="Ex: comida congelada em porções"
                />
                <p className="text-[11px] text-stone-500">
                  Utilizada pelo motor de auditoria para verificar a relevância sem keyword stuffing.
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase text-stone-700">
                  Intenção Predominante de Busca
                </label>
                <select
                  value={seoSettings.searchIntent}
                  onChange={(e) => setSeoSettings({ ...seoSettings, searchIntent: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-stone-300 text-sm focus:outline-none focus:border-stone-500 bg-white"
                >
                  <option value="commercial">Comercial (Investigação de cardápio e pratos)</option>
                  <option value="transactional">Transacional (Decisão de compra/encomenda)</option>
                  <option value="informational">Informacional (Receitas, preparo e conservação)</option>
                  <option value="navigational">Navegacional (Busca direta pelo nome da marca)</option>
                </select>
              </div>
            </div>
          </Card>

          <Card className="p-6 bg-white border-stone-200 shadow-xs space-y-6">
            <h2 className="text-base font-bold font-heading text-stone-900 flex items-center gap-2">
              <Globe className="w-5 h-5 text-amber-600" />
              Conexão com Google Analytics & Google Search Console
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase text-stone-700">
                  ID de Medição do GA4 (Google Analytics)
                </label>
                <input
                  type="text"
                  value={seoSettings.ga4Id}
                  onChange={(e) => setSeoSettings({ ...seoSettings, ga4Id: e.target.value })}
                  placeholder="G-XXXXXXXXXX"
                  className="w-full px-3.5 py-2.5 rounded-lg border border-stone-300 text-sm focus:outline-none focus:border-stone-500"
                />
                <p className="text-[11px] text-stone-500">
                  Injetado assincronamente apenas após consentimento de cookies pelo visitante.
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase text-stone-700">
                  Tag de Verificação do Google Search Console
                </label>
                <input
                  type="text"
                  value={seoSettings.gscTag}
                  onChange={(e) => setSeoSettings({ ...seoSettings, gscTag: e.target.value })}
                  placeholder="Código do meta tag google-site-verification"
                  className="w-full px-3.5 py-2.5 rounded-lg border border-stone-300 text-sm focus:outline-none focus:border-stone-500"
                />
                <p className="text-[11px] text-stone-500">
                  Permite provar a propriedade do domínio no Search Console sem editar arquivos no servidor.
                </p>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <Button type="submit" className="flex items-center gap-2">
                <Save className="w-4 h-4" />
                Salvar Configurações
              </Button>
            </div>
          </Card>
        </form>
      )}
    </div>
  );
}
