#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Testes unitários de eval.py (sem rede, sem banco)."""
import importlib
import os
import csv
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

eval_mod = importlib.import_module("eval")

from dataset_core import cnj_numero

COLUNAS = ["cliente", "telefone", "numero_processo", "percentual_exito",
           "valor_total", "parcela", "incerto", "revisado"]


def linha(**campos):
    base = {c: "" for c in COLUNAS}
    base.update(campos)
    return base


class BaseEval(unittest.TestCase):
    def escrever(self, diretorio, nome, linhas):
        caminho = os.path.join(diretorio, nome)
        with open(caminho, "w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=COLUNAS)
            w.writeheader()
            for l in linhas:
                w.writerow(l)
        return caminho

    def avaliar(self, gt_linhas, ocr_linhas, nome="caso.csv", real=False):
        with tempfile.TemporaryDirectory() as tmp:
            gt_dir = os.path.join(tmp, "gt")
            ocr_dir = os.path.join(tmp, "ocr")
            os.makedirs(gt_dir)
            os.makedirs(ocr_dir)
            self.escrever(gt_dir, nome, gt_linhas)
            self.escrever(ocr_dir, nome, ocr_linhas)
            return eval_mod.avaliar(gt_dir, ocr_dir, real=real)

    @staticmethod
    def por_campo(resultados, campo):
        return [r for r in resultados if r["campo"] == campo]


class TestAlinhamento(BaseEval):
    def test_arquivo_perfeito_zero_erro(self):
        gt = [linha(cliente="Ana", numero_processo="0046868-56.2025.8.26.0100",
                    valor_total="1.250,00", percentual_exito="20", parcela="1/1")]
        ocr = [dict(gt[0])]
        resultados = self.avaliar(gt, ocr)
        self.assertTrue(resultados)
        self.assertTrue(all(r["exato"] for r in resultados))
        self.assertEqual(eval_mod.taxa_erro_ponderada(resultados), 0.0)
        self.assertEqual(sum(1 for r in resultados if r["falso_confiante"]), 0)

    def test_digito_errado_no_processo_vira_erro_de_campo(self):
        gt = [linha(cliente="Ana", numero_processo="0046868-56.2025.8.26.0100",
                    percentual_exito="20", parcela="1/1")]
        ocr = [linha(cliente="Ana", numero_processo="0046868-66.2025.8.26.0100",
                     percentual_exito="20", parcela="1/1")]
        resultados = self.avaliar(gt, ocr)
        processo = self.por_campo(resultados, "numero_processo")
        self.assertEqual(len(processo), 1)
        self.assertFalse(processo[0]["exato"])
        self.assertTrue(processo[0]["presente_gt"])
        self.assertTrue(processo[0]["presente_ocr"])
        # Não pode virar "ausente + extra".
        self.assertEqual([r for r in resultados if not r["presente_gt"]], [])
        self.assertEqual([r for r in resultados if not r["presente_ocr"]], [])
        # Só o processo erra; os demais campos batem.
        self.assertEqual([r["campo"] for r in resultados if not r["exato"]],
                         ["numero_processo"])

    def test_chave_vazia_casa_por_posicao(self):
        gt = [linha(cliente="Sem processo", percentual_exito="20"),
              linha(cliente="Outro", percentual_exito="30")]
        ocr = [linha(cliente="Sem processo", percentual_exito="20"),
               linha(cliente="Outro", percentual_exito="30")]
        resultados = self.avaliar(gt, ocr)
        self.assertTrue(all(r["exato"] for r in resultados))
        self.assertEqual([r for r in resultados if not r["presente_ocr"]], [])

    def test_linha_extra_no_ocr_conta_como_extra(self):
        gt = [linha(cliente="Ana", numero_processo=cnj_numero("0208938"))]
        ocr = gt + [linha(cliente="Fantasma", numero_processo=cnj_numero("0210811"))]
        resultados = self.avaliar(gt, ocr)
        extras = [r for r in resultados if not r["presente_gt"]]
        self.assertTrue(extras)
        cliente_extra = [r for r in extras if r["campo"] == "cliente"]
        self.assertEqual(len(cliente_extra), 1)
        self.assertEqual(cliente_extra[0]["erro"], 1)


class TestPesos(BaseEval):
    def test_erro_monetario_pesa_mais_que_erro_comum(self):
        gt = [linha(cliente="Ana", valor_total="1.250,00")]
        ocr_moeda = [linha(cliente="Ana", valor_total="1.250,50")]
        ocr_comum = [linha(cliente="Bruno", valor_total="1.250,00")]

        res_moeda = self.avaliar(gt, ocr_moeda)
        res_comum = self.avaliar(gt, ocr_comum)

        peso_moeda = [r["peso"] for r in res_moeda if r["campo"] == "valor_total"][0]
        peso_comum = [r["peso"] for r in res_comum if r["campo"] == "cliente"][0]
        self.assertEqual(peso_comum, eval_mod.PESO_CAMPO["cliente"])
        self.assertEqual(peso_moeda,
                         eval_mod.PESO_CAMPO["valor_total"] * eval_mod.PESO_ERRO_MONETARIO)
        self.assertGreater(eval_mod.taxa_erro_ponderada(res_moeda),
                           eval_mod.taxa_erro_ponderada(res_comum))

    def test_peso_por_campo_aplicado(self):
        gt = [linha(numero_processo=cnj_numero("0208938"), cliente="Ana")]
        ocr = [linha(numero_processo=cnj_numero("0208938"), cliente="Bruno")]
        resultados = self.avaliar(gt, ocr)
        pesos = {r["campo"]: r["peso"] for r in resultados}
        self.assertEqual(pesos["numero_processo"], eval_mod.PESO_CAMPO["numero_processo"])
        self.assertEqual(pesos["cliente"], eval_mod.PESO_CAMPO["cliente"])


class TestFalsoConfiante(BaseEval):
    def test_telefone_com_digito_trocado_passa_na_normalizacao(self):
        gt = [linha(telefone="85962663254")]
        ocr = [linha(telefone="85962663255")]
        resultados = self.avaliar(gt, ocr)
        tel = self.por_campo(resultados, "telefone")[0]
        self.assertFalse(tel["exato"])
        self.assertTrue(tel["falso_confiante"])

    def test_telefone_com_digito_a_mais_e_barreado(self):
        gt = [linha(telefone="85962663254")]
        ocr = [linha(telefone="859626632540")]
        resultados = self.avaliar(gt, ocr)
        tel = self.por_campo(resultados, "telefone")[0]
        self.assertFalse(tel["exato"])
        self.assertFalse(tel["falso_confiante"])

    def test_moeda_com_separador_errado_passa_na_normalizacao(self):
        gt = [linha(valor_total="1.250,00")]
        ocr = [linha(valor_total="1.250.00")]
        resultados = self.avaliar(gt, ocr)
        moeda = self.por_campo(resultados, "valor_total")[0]
        self.assertFalse(moeda["exato"])
        self.assertTrue(moeda["erro_monetario"])
        self.assertTrue(moeda["falso_confiante"])

    def test_cnj_com_dv_valido_mas_numero_diferente(self):
        gt = [linha(numero_processo=cnj_numero("0208938"))]
        ocr = [linha(numero_processo=cnj_numero("0210811"))]
        resultados = self.avaliar(gt, ocr)
        processo = self.por_campo(resultados, "numero_processo")[0]
        self.assertFalse(processo["exato"])
        self.assertTrue(processo["falso_confiante"])
        self.assertEqual(eval_mod.check_cnj_check_digit(ocr[0]["numero_processo"]),
                         "valid")


class TestIncerto(BaseEval):
    def test_celula_incerto_fora_do_placar(self):
        gt = [linha(cliente="Ana", valor_total="1.250,00", incerto="valor_total")]
        ocr = [linha(cliente="Ana", valor_total="9.999,99")]
        resultados = self.avaliar(gt, ocr)
        moeda = self.por_campo(resultados, "valor_total")[0]
        self.assertTrue(moeda["incerto"])
        validas = eval_mod._linhas_avaliadas(resultados)
        self.assertNotIn("valor_total", [r["campo"] for r in validas])
        # o resto da linha continua entrando no placar
        self.assertIn("cliente", [r["campo"] for r in validas])
        self.assertEqual(eval_mod.taxa_erro_ponderada(validas), 0.0)

    def test_incerto_com_asterisco_marca_todos_os_campos(self):
        gt = [linha(cliente="Ana", valor_total="1.250,00", incerto="*")]
        ocr = [linha(cliente="Bruno", valor_total="9.999,99")]
        resultados = self.avaliar(gt, ocr)
        self.assertTrue(all(r["incerto"] for r in resultados
                            if r["campo"] not in eval_mod.CAMPOS_IGNORADOS))
        self.assertEqual(eval_mod._linhas_avaliadas(resultados), [])

    def test_erro_confiante_em_celula_incerto(self):
        gt = [linha(valor_total="1.250,00", incerto="valor_total")]
        ocr = [linha(valor_total="1.250,50")]
        resultados = self.avaliar(gt, ocr)
        incertos = [r for r in resultados if r["incerto"]]
        self.assertEqual(len(incertos), 1)
        self.assertTrue(incertos[0]["ocr"].strip())


class TestModoReal(BaseEval):
    def test_filtra_revisado_nao(self):
        gt = [linha(cliente="Ana", percentual_exito="20", revisado="nao"),
              linha(cliente="Bruno", percentual_exito="30", revisado="sim")]
        ocr = [linha(cliente="Ana", percentual_exito="20"),
               linha(cliente="Bruno", percentual_exito="30")]
        resultados = self.avaliar(gt, ocr, real=True)
        clientes = self.por_campo(resultados, "cliente")
        self.assertEqual(len(clientes), 1)
        self.assertEqual(clientes[0]["gt"], "Bruno")

    def test_modo_real_sem_ocr_nao_quebra(self):
        gt = [linha(cliente="Ana", revisado="sim")]
        with tempfile.TemporaryDirectory() as tmp:
            gt_dir = os.path.join(tmp, "gt")
            os.makedirs(gt_dir)
            self.escrever(gt_dir, "caso.csv", gt)
            resultados = eval_mod.avaliar(gt_dir, os.path.join(tmp, "nao-existe"),
                                          real=True)
        self.assertEqual(resultados, [])


if __name__ == "__main__":
    unittest.main()
