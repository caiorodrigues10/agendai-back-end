#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Teste do parser de OCR estruturado (TypeScript).

Roda `dataset-real/test_ocr_para_csv.ts` pelo tsx do spike e falha se:
  • o CSV gerado a partir do texto bruto inventado divergir do esperado;
  • algum valor do ground truth real aparecer dentro do `ocr-para-csv.ts`.

Dois testes, para o pytest não ficar verde em silêncio:
  • `test_parser_ocr_estruturado` — sempre roda o script;
  • `test_grep_sem_valor_do_gt_no_parser` — faz o grep do ground truth e sai
    como **SKIP** quando `ground-truth-real/` não existe (em vez de passar
    sem conferir nada).

Se o tsx (node_modules do spike) não estiver instalado, os testes que precisam
dele são pulados.
"""
import os
import subprocess
import unittest

BASE = os.path.dirname(os.path.abspath(__file__))
SPIKE = os.path.dirname(BASE)
TSX = os.path.join(SPIKE, "node_modules", ".bin", "tsx")
SCRIPT = os.path.join(BASE, "test_ocr_para_csv.ts")
GT_REAL = os.path.join(BASE, "ground-truth-real")


def exigir_ground_truth_real(diretorio, teste):
    """SKIP (não pass) quando o ground truth real não existe."""
    if not os.path.isdir(diretorio):
        teste.skipTest(
            f"ground-truth-real/ ausente ({diretorio}): "
            "teste do grep do ground truth pulado"
        )


def rodar_script(teste):
    """Roda o script TS do parser e devolve o CompletedProcess."""
    if not os.path.exists(TSX):
        teste.skipTest("tsx indisponivel (node_modules do spike ausente)")
    if not os.path.exists(SCRIPT):
        teste.fail(f"script de teste ausente: {SCRIPT}")
    return subprocess.run(
        [TSX, SCRIPT], cwd=SPIKE, capture_output=True, text=True, check=False
    )


class TestParserOcrEstruturado(unittest.TestCase):
    def test_parser_ocr_estruturado(self):
        proc = rodar_script(self)
        self.assertEqual(
            proc.returncode, 0,
            "parser de OCR estruturado divergiu:\n" + proc.stdout + proc.stderr,
        )

    def test_grep_sem_valor_do_gt_no_parser(self):
        exigir_ground_truth_real(GT_REAL, self)
        proc = rodar_script(self)
        self.assertEqual(
            proc.returncode, 0,
            "grep do ground truth falhou:\n" + proc.stdout + proc.stderr,
        )
        self.assertIn("grep do ground truth:", proc.stdout)
        self.assertNotIn("PULADO", proc.stdout)
        self.assertIn("nenhum literal do GT no .ts", proc.stdout)

    def test_ausencia_do_ground_truth_real_vira_skip(self):
        """Sem `ground-truth-real/`, o teste do grep é SKIP — não verde."""
        ausente = os.path.join(BASE, "diretorio-que-nao-existe")
        self.assertFalse(os.path.isdir(ausente))
        with self.assertRaises(unittest.SkipTest) as capturado:
            exigir_ground_truth_real(ausente, self)
        self.assertIn("ground-truth-real/ ausente", str(capturado.exception))


if __name__ == "__main__":
    unittest.main()
