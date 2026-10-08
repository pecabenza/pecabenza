import { NextResponse } from 'next/server';
import { logger } from '@/lib/observability/logger';

/**
 * Cria uma resposta HTTP de erro segura sem vazar detalhes de banco de dados,
 * senhas, tokens ou stack traces para o usuário final.
 */
export function createSafeErrorResponse(
  error: unknown,
  status = 500,
  context?: { tenantId?: string; path?: string; action?: string }
): NextResponse {
  const errorId = `err_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  
  // Log interno detalhado para auditoria
  logger.error(
    `[SafeError] Falha capturada na requisição (${errorId})`,
    error,
    {
      tenantId: context?.tenantId,
      path: context?.path,
      action: context?.action,
      statusCode: status,
      errorId,
    }
  );

  let userMessage = 'Ocorreu um erro inesperado ao processar sua solicitação.';
  if (status === 400) {
    userMessage = 'Os dados enviados são inválidos ou estão incompletos.';
  } else if (status === 401) {
    userMessage = 'Acesso não autorizado. Faça login para continuar.';
  } else if (status === 403) {
    userMessage = 'Você não possui permissão para acessar este recurso.';
  } else if (status === 404) {
    userMessage = 'O recurso solicitado não foi encontrado.';
  } else if (status === 429) {
    userMessage = 'Muitas tentativas em curto período. Por favor, aguarde alguns instantes.';
  }

  return NextResponse.json(
    {
      success: false,
      error: userMessage,
      error_id: errorId,
    },
    { status }
  );
}
