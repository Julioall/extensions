// Leitura ESTRITA de notas. Nunca "adivinha": se não der para ter certeza, rejeita com motivo.
// Corrige o defeito da versão 0.8.1, que removia caracteres e transformava "8 de 10" em 810.
(function (root) {
  'use strict';

  const MAX_DECIMALS = 5;

  // Retorna { ok, empty, canonical, value, error }.
  // canonical usa "." como decimal e é a forma usada para comparar e gravar (após formatGrade).
  // opts.max: nota máxima da atividade (número) ou null. Aceita "45/50" só se o denominador == max.
  function parseGrade(raw, opts = {}) {
    const max = Number.isFinite(opts.max) ? opts.max : null;
    let text = String(raw ?? '').replace(/[   ]/g, ' ').trim();
    text = text.replace(/^(["'])(.*)\1$/, '$2').trim();
    if (!text) return { ok: true, empty: true, canonical: '', value: null };

    const fraction = text.match(/^(.+?)\s*\/\s*(\d+(?:[.,]\d+)?)$/);
    if (fraction) {
      const denominator = Number(fraction[2].replace(',', '.'));
      if (max === null || denominator !== max) {
        return fail(`"${raw}" usa fração; informe só o número (nota máxima da atividade: ${max ?? 'desconhecida'}).`);
      }
      text = fraction[1].trim();
    }

    if (!/^\d[\d.,]*$/.test(text)) return fail(`"${raw}" não é um número válido (use só dígitos, vírgula ou ponto).`);

    const lastComma = text.lastIndexOf(',');
    const lastDot = text.lastIndexOf('.');
    let integerPart;
    let decimalPart = '';

    if (lastComma !== -1 && lastDot !== -1) {
      // Os dois separadores: o último é decimal, o outro só pode ser milhar (grupos de 3).
      const decimalIndex = Math.max(lastComma, lastDot);
      const thousandsChar = lastComma > lastDot ? '.' : ',';
      integerPart = text.slice(0, decimalIndex);
      decimalPart = text.slice(decimalIndex + 1);
      if (integerPart.includes(text[decimalIndex])) return fail(`"${raw}" tem separadores ambíguos.`);
      if (!new RegExp(`^\\d{1,3}(\\${thousandsChar}\\d{3})+$`).test(integerPart)) {
        return fail(`"${raw}" tem separadores ambíguos.`);
      }
      integerPart = integerPart.split(thousandsChar).join('');
    } else if (lastComma !== -1 || lastDot !== -1) {
      const sep = lastComma !== -1 ? ',' : '.';
      if (text.split(sep).length > 2) return fail(`"${raw}" tem mais de um separador decimal.`);
      [integerPart, decimalPart] = text.split(sep);
      if (decimalPart === '') return fail(`"${raw}" termina em separador decimal.`);
    } else {
      integerPart = text;
    }

    if (integerPart === '' || decimalPart.length > MAX_DECIMALS) {
      return fail(`"${raw}" tem casas decimais demais (máximo ${MAX_DECIMALS}).`);
    }
    if (integerPart.length > 1 && integerPart.startsWith('0') && !/^0+$/.test(integerPart)) {
      integerPart = integerPart.replace(/^0+/, '') || '0';
    }

    const canonical = decimalPart ? `${integerPart}.${decimalPart}` : integerPart;
    const value = Number(canonical);
    if (!Number.isFinite(value)) return fail(`"${raw}" não é um número válido.`);
    if (max !== null && value > max) return fail(`${canonical} é maior que a nota máxima (${max}).`);
    return { ok: true, empty: false, canonical, value };

    function fail(error) {
      return { ok: false, empty: false, canonical: '', value: null, error };
    }
  }

  // Texto para gravar no campo do Moodle, no separador decimal da página.
  function formatGrade(canonical, decimalSeparator = '.') {
    const text = String(canonical ?? '');
    return decimalSeparator === ',' ? text.replace('.', ',') : text;
  }

  // Converte desempenho 0–100 em nota proporcional à nota máxima (arredonda em 2 casas).
  function scalePercent(percent, max) {
    if (!Number.isFinite(percent) || !Number.isFinite(max)) return null;
    const scaled = Math.round((percent / 100) * max * 100) / 100;
    return String(scaled);
  }

  // Lê "45", "45,0" ou "45.00" da página e compara numericamente (a leitura de volta não pode depender do formato).
  function sameGrade(a, b) {
    const left = parseGrade(a);
    const right = parseGrade(b);
    if (!left.ok || !right.ok) return String(a ?? '').trim() === String(b ?? '').trim();
    if (left.empty || right.empty) return left.empty && right.empty;
    return left.value === right.value;
  }

  root.IMN.grade = { parseGrade, formatGrade, scalePercent, sameGrade, MAX_DECIMALS };
})(globalThis);
