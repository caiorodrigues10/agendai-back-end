#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Testes unitários de eval.py (sem rede, sem banco)."""
import importlib
import io
import json
import os
import csv
import contextlib
import re
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

eval_mod = importlib.import_module("eval")

from dataset_core import cnj_numero

BASE = os.path.dirname(os.path.abspath(__file__))
FIXTURE_PARIDADE = os.path.join(BASE, "paridade-normalizadores.json")

COLUNAS = ["cliente", "telefone", "numero_processo", "percentual_exito",
           "valor_total", "parcela", "status", "incerto", "revisado"]

COLUNAS_DASHBOARD = ["secao", "categoria", "detalhe", "valor", "incerto", "revisado"]


def linha(**campos):
    base = {c: "" for c in COLUNAS}
    base.update(campos)
    return base


def linha_dashboard(**campos):
    base = {c: "" for c in COLUNAS_DASHBOARD}
    base.update(campos)
    return base


class BaseEval(unittest.TestCase):
    def escrever(self, diretorio, nome, linhas, colunas=None):
        caminho = os.path.join(diretorio, nome)
        with open(caminho, "w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=colunas or COLUNAS)
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

    def test_sobras_sao_pareadas_pelo_menor_cer_do_processo(self):
        processo_a = cnj_numero("0208938")
        processo_b = cnj_numero("0210811")
        gt = [linha(cliente="Ana", numero_processo=processo_a),
              linha(cliente="Bruno", numero_processo=processo_b)]
        # OCR na ordem inversa, com um digito trocado em cada processo.
        ocr = [linha(cliente="Bruno", numero_processo=processo_b.replace("0210811", "0210812")),
               linha(cliente="Ana", numero_processo=processo_a.replace("0208938", "0208939"))]
        resultados = self.avaliar(gt, ocr)
        # Cada linha do GT casa com a linha do OCR de mesmo processo (menor CER),
        # e nao com a da posicao.
        por_cliente = {}
        for r in resultados:
            if r["campo"] == "cliente":
                por_cliente[r["gt"]] = r
        self.assertEqual(por_cliente["Ana"]["ocr"], "Ana")
        self.assertEqual(por_cliente["Bruno"]["ocr"], "Bruno")
        # So o numero do processo erra (um digito) em cada linha.
        erros = [r for r in resultados if not r["exato"]]
        self.assertEqual(len(erros), 2)
        self.assertEqual({r["campo"] for r in erros}, {"numero_processo"})
        # Nada vira "ausente + extra".
        self.assertEqual([r for r in resultados if not r["presente_gt"]], [])
        self.assertEqual([r for r in resultados if not r["presente_ocr"]], [])

    def test_chave_repetida_usa_posicao_como_desempate(self):
        """3 linhas de GT com a MESMA chave (processo + parcela) e 1 erro de
        status na 2ª linha do OCR: o erro tem que cair na linha certa (a 2ª),
        sem virar AUSENTE + EXTRA."""
        processo = cnj_numero("0046868")
        gt = [linha(cliente="Ana", numero_processo=processo, parcela="1/3", status="pendente"),
              linha(cliente="Bruno", numero_processo=processo, parcela="1/3", status="em_analise"),
              linha(cliente="Carla", numero_processo=processo, parcela="1/3", status="fechado")]
        ocr = [linha(cliente="Ana", numero_processo=processo, parcela="1/3", status="pendente"),
               linha(cliente="Bruno", numero_processo=processo, parcela="1/3", status="pago"),
               linha(cliente="Carla", numero_processo=processo, parcela="1/3", status="fechado")]
        resultados = self.avaliar(gt, ocr)
        # Nenhuma linha ficou de fora (nada de AUSENTE nem EXTRA).
        self.assertEqual([r for r in resultados if not r["presente_gt"]], [])
        self.assertEqual([r for r in resultados if not r["presente_ocr"]], [])
        # O unico erro e o status, e ele pertence a 2a linha do GT.
        erros = [r for r in resultados if not r["exato"]]
        self.assertEqual(len(erros), 1)
        self.assertEqual(erros[0]["campo"], "status")
        self.assertEqual(erros[0]["gt"], "em_analise")
        self.assertEqual(erros[0]["ocr"], "pago")
        # Os status das linhas 1 e 3 continuam exatos.
        status = {r["gt"]: r["exato"] for r in resultados if r["campo"] == "status"}
        self.assertEqual(status, {"pendente": True, "em_analise": False, "fechado": True})


class TestAlinhamentoSemProcesso(BaseEval):
    """Sessão 7: linhas SEM numero_processo (dashboard, planilha de serviços)
    casam pela chave textual quando ela é única nos dois lados."""

    def avaliar_dashboard(self, gt_linhas, ocr_linhas, real=False):
        with tempfile.TemporaryDirectory() as tmp:
            gt_dir = os.path.join(tmp, "gt")
            ocr_dir = os.path.join(tmp, "ocr")
            os.makedirs(gt_dir)
            os.makedirs(ocr_dir)
            self.escrever(gt_dir, "dash.csv", gt_linhas, colunas=COLUNAS_DASHBOARD)
            self.escrever(ocr_dir, "dash.csv", ocr_linhas, colunas=COLUNAS_DASHBOARD)
            return eval_mod.avaliar(gt_dir, ocr_dir, real=real)

    @staticmethod
    def par(resultados, campo, gt_valor):
        pares = [r for r in resultados if r["campo"] == campo and r["gt"] == gt_valor]
        return pares[0]

    def test_linhas_reordenadas_casam_pela_chave_textual(self):
        """OCR com as mesmas linhas em outra ordem: a chave textual casa
        cada linha (a posicao so casaria errado)."""
        gt = [linha_dashboard(categoria="Entradas", valor="9.876,54"),
              linha_dashboard(categoria="Saídas", valor="1.111,22"),
              linha_dashboard(categoria="Balanço", valor="3.333,44")]
        ocr = [linha_dashboard(categoria="Balanço", valor="3.333,44"),
               linha_dashboard(categoria="Saídas", valor="1.111,22"),
               linha_dashboard(categoria="Entradas", valor="9.876,54")]
        resultados = self.avaliar_dashboard(gt, ocr)
        self.assertTrue(resultados)
        self.assertTrue(all(r["exato"] for r in resultados),
                        [r for r in resultados if not r["exato"]])
        # Nada de AUSENTE nem EXTRA: as 3 linhas casaram 1:1.
        self.assertEqual([r for r in resultados if not r["presente_ocr"]], [])
        self.assertEqual([r for r in resultados if not r["presente_gt"]], [])

    def test_linha_faltando_nao_desloca_as_demais(self):
        """OCR sem a linha do meio: as outras duas continuam casando certas
        (sem deslocar) e a que falta vira AUSENTE, nao "linha errada"."""
        gt = [linha_dashboard(categoria="Entradas", valor="9.876,54"),
              linha_dashboard(categoria="Saídas", valor="1.111,22"),
              linha_dashboard(categoria="Balanço", valor="3.333,44")]
        ocr = [linha_dashboard(categoria="Entradas", valor="9.876,54"),
               linha_dashboard(categoria="Balanço", valor="3.333,44")]
        resultados = self.avaliar_dashboard(gt, ocr)
        # As duas linhas presentes casaram certas (nada deslocou).
        presentes = [r for r in resultados if r["presente_ocr"]]
        self.assertTrue(presentes)
        self.assertTrue(all(r["exato"] for r in presentes),
                        [r for r in presentes if not r["exato"]])
        # A linha que falta ficou AUSENTE em todos os campos dela.
        ausentes = [r for r in resultados if not r["presente_ocr"]]
        self.assertTrue(ausentes)
        self.assertEqual({r["gt"] for r in ausentes if r["campo"] == "categoria"},
                         {"Saídas"})
        self.assertEqual(len([r for r in ausentes if r["campo"] == "categoria"]), 1)
        # Nenhuma linha do OCR virou "extra".
        self.assertEqual([r for r in resultados if not r["presente_gt"]], [])

    def test_rotulo_repetido_nao_reordena_e_cai_na_posicao(self):
        """Chave textual repetida não identifica a linha: o pareamento
        continua por posição (as duas linhas continuam 1:1, sem perder
        nem duplicar linha)."""
        gt = [linha_dashboard(categoria="Lavagem", detalhe="1"),
              linha_dashboard(categoria="Lavagem", detalhe="2")]
        ocr = [linha_dashboard(categoria="Lavagem", detalhe="2"),
               linha_dashboard(categoria="Lavagem", detalhe="1")]
        resultados = self.avaliar_dashboard(gt, ocr)
        # Nenhuma linha some nem vira extra (o grupo inteiro casa 1:1).
        self.assertEqual([r for r in resultados if not r["presente_ocr"]], [])
        self.assertEqual([r for r in resultados if not r["presente_gt"]], [])
        # Mas o detalhe não casa: a posição casou linha1 x linha1.
        detalhe = [r for r in resultados if r["campo"] == "detalhe"]
        self.assertEqual([r["exato"] for r in detalhe], [False, False])


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

    def test_campo_de_texto_nao_conta_como_falso_confiante(self):
        """Sessão 7: texto errado não é falso confiante (não há normalizador
        que o erro pudesse atravessar)."""
        gt = [linha(cliente="Ana")]
        ocr = [linha(cliente="Bruno")]
        resultados = self.avaliar(gt, ocr)
        celula = self.por_campo(resultados, "cliente")[0]
        self.assertFalse(celula["exato"])
        self.assertFalse(celula["falso_confiante"])

    def test_status_pendente_lido_como_pago_e_falso_confiante(self):
        """`status` tem normalizador (FEE_STATUS_MAP): `pago` é aceito, então
        ler `pendente` como `pago` entra no sistema sem nenhum aviso."""
        gt = [linha(status="pendente")]
        ocr = [linha(status="pago")]
        resultados = self.avaliar(gt, ocr)
        status = self.por_campo(resultados, "status")[0]
        self.assertFalse(status["exato"])
        self.assertTrue(status["falso_confiante"])

    def test_status_desconhecido_nao_e_falso_confiante(self):
        """Valor fora do FEE_STATUS_MAP vira PENDING com aviso: o filtro da
        produção barrou o texto, então não é falso confiante."""
        gt = [linha(status="pendente")]
        ocr = [linha(status="em aberto")]
        resultados = self.avaliar(gt, ocr)
        status = self.por_campo(resultados, "status")[0]
        self.assertFalse(status["exato"])
        self.assertFalse(status["falso_confiante"])
        # O valor do OCR não é reconhecido pelo mapa.
        self.assertIn("warning", eval_mod.parse_fee_status("em aberto"))
        self.assertNotIn("warning", eval_mod.parse_fee_status("pago"))

    def test_somente_campos_com_normalizador_contam(self):
        for campo in ("telefone", "numero_processo", "status", "valor",
                      "valor_total", "percentual_exito", "percentual_comissao"):
            self.assertTrue(eval_mod._tem_normalizador(campo), campo)
        for campo in ("cliente", "servico", "categoria", "detalhe", "secao",
                      "parcela", "data_criacao"):
            self.assertFalse(eval_mod._tem_normalizador(campo), campo)

    def test_relatorio_mostra_tabela_de_falso_confiante_por_campo(self):
        gt = [linha(cliente="Ana", telefone="85962663254", revisado="sim")]
        ocr = [linha(cliente="Bruno", telefone="85962663255")]
        with tempfile.TemporaryDirectory() as tmp:
            gt_dir = os.path.join(tmp, "gt")
            ocr_dir = os.path.join(tmp, "ocr")
            os.makedirs(gt_dir)
            os.makedirs(ocr_dir)
            self.escrever(gt_dir, "caso.csv", gt)
            self.escrever(ocr_dir, "caso.csv", ocr)
            saida = io.StringIO()
            with contextlib.redirect_stdout(saida):
                codigo = eval_mod.executar(gt_dir, ocr_dir, real=False)
        texto = saida.getvalue()
        self.assertEqual(codigo, 0)
        self.assertIn("FALSO CONFIANTE POR CAMPO", texto)
        # Só o telefone conta: o erro de texto está na tabela com 0 falso.
        tabela = texto.split("FALSO CONFIANTE POR CAMPO", 1)[1].split(
            "campo de texto sem normalizador", 1)[0]
        self.assertRegex(tabela, r"cliente\s+1\s+0")
        self.assertRegex(tabela, r"telefone\s+1\s+1")
        # A nota diz o que não conta e por quê.
        nota = texto.split("campo de texto sem normalizador", 1)[1]
        self.assertIn("NAO conta", nota)
        self.assertIn("cliente", nota)
        self.assertIn("contam so campos com normalizador de producao", nota)
        self.assertIn("Falso confiante: 1", texto)


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

    def test_modo_real_sem_ocr_conta_como_erro_total(self):
        """GT com revisado=sim e nenhum arquivo de OCR: as celulas do GT
        entram no placar como AUSENTES (nao podem sumir do placar)."""
        gt = [linha(cliente="Ana", valor_total="1.250,00", revisado="sim")]
        with tempfile.TemporaryDirectory() as tmp:
            gt_dir = os.path.join(tmp, "gt")
            os.makedirs(gt_dir)
            self.escrever(gt_dir, "caso.csv", gt)
            resultados, sem_extracao, _excluidos = eval_mod.avaliar_detalhado(
                gt_dir, os.path.join(tmp, "nao-existe"), real=True)
        self.assertTrue(resultados)
        self.assertTrue(all(not r["presente_ocr"] for r in resultados))
        # Celula com valor no GT vira erro (peso de erro > 0).
        erros = [r for r in resultados if r["gt"]]
        self.assertTrue(erros)
        self.assertTrue(all(r["erro"] == 1 for r in erros))
        self.assertEqual(sem_extracao, [("caso.csv", 1)])

    def test_contar_revisadas(self):
        gt = [linha(revisado="nao"), linha(revisado="sim"), linha(revisado="SIM")]
        with tempfile.TemporaryDirectory() as tmp:
            gt_dir = os.path.join(tmp, "gt")
            os.makedirs(gt_dir)
            self.escrever(gt_dir, "caso.csv", gt)
            revisadas, total = eval_mod._contar_revisadas(gt_dir)
        self.assertEqual((revisadas, total), (2, 3))

    def test_modo_real_sem_linhas_revisadas_avisa_e_sai_sem_erro(self):
        gt = [linha(cliente="Ana", revisado="nao")]
        with tempfile.TemporaryDirectory() as tmp:
            gt_dir = os.path.join(tmp, "gt")
            ocr_dir = os.path.join(tmp, "ocr")
            os.makedirs(gt_dir)
            os.makedirs(ocr_dir)
            self.escrever(gt_dir, "caso.csv", gt)
            self.escrever(ocr_dir, "caso.csv", gt)
            saida = io.StringIO()
            with contextlib.redirect_stdout(saida):
                codigo = eval_mod.executar(gt_dir, ocr_dir, real=True)
        self.assertEqual(codigo, 0)
        self.assertIn("AVISO", saida.getvalue())
        self.assertIn("nenhuma linha com revisado=sim", saida.getvalue())

    def test_modo_real_nao_imprime_valores_de_celula(self):
        gt = [linha(cliente="Ana Confidencial", telefone="85962663254", revisado="sim")]
        with tempfile.TemporaryDirectory() as tmp:
            gt_dir = os.path.join(tmp, "gt")
            ocr_dir = os.path.join(tmp, "ocr")
            os.makedirs(gt_dir)
            os.makedirs(ocr_dir)
            self.escrever(gt_dir, "caso.csv", gt)
            self.escrever(ocr_dir, "caso.csv", gt)
            saida = io.StringIO()
            with contextlib.redirect_stdout(saida):
                codigo = eval_mod.executar(gt_dir, ocr_dir, real=True)
        texto = saida.getvalue()
        self.assertEqual(codigo, 0)
        self.assertNotIn("Ana Confidencial", texto)
        self.assertNotIn("85962663254", texto)

    def test_modo_real_com_divergencia_nao_imprime_valores(self):
        """GT e OCR com nome e telefone diferentes (revisado=sim): a saída do
        modo real tem que mostrar só métricas — nenhum valor do GT ou do OCR."""
        gt = [linha(cliente="Beatriz Nogueira", telefone="85962663254",
                    numero_processo=cnj_numero("0208938"), revisado="sim")]
        ocr = [linha(cliente="Joao Souza", telefone="85962663255",
                     numero_processo=cnj_numero("0210811"))]
        with tempfile.TemporaryDirectory() as tmp:
            gt_dir = os.path.join(tmp, "gt")
            ocr_dir = os.path.join(tmp, "ocr")
            os.makedirs(gt_dir)
            os.makedirs(ocr_dir)
            self.escrever(gt_dir, "caso.csv", gt)
            self.escrever(ocr_dir, "caso.csv", ocr)
            saida = io.StringIO()
            with contextlib.redirect_stdout(saida):
                codigo = eval_mod.executar(gt_dir, ocr_dir, real=True)
        texto = saida.getvalue()
        self.assertEqual(codigo, 0)
        # Nenhum valor (do GT nem do OCR) pode vazar para a saída.
        for valor in ["Beatriz Nogueira", "Joao Souza", "85962663254", "85962663255",
                      cnj_numero("0208938"), cnj_numero("0210811")]:
            self.assertNotIn(valor, texto, f"valor vazou na saida do modo real: {valor}")
        # ... mas as métricas continuam aparecendo.
        self.assertIn("GERAL", texto)
        self.assertIn("Taxa de erro ponderada", texto)


class TestSemExtracao(BaseEval):
    """Arquivo de GT sem nenhuma linha de OCR: tem que aparecer no geral."""

    def preparar(self, tmp, arquivos_gt, arquivos_ocr):
        gt_dir = os.path.join(tmp, "gt")
        ocr_dir = os.path.join(tmp, "ocr")
        os.makedirs(gt_dir)
        os.makedirs(ocr_dir)
        for nome, linhas in arquivos_gt.items():
            self.escrever(gt_dir, nome, linhas)
        for nome, linhas in arquivos_ocr.items():
            self.escrever(ocr_dir, nome, linhas)
        return gt_dir, ocr_dir

    def test_arquivo_sem_ocr_nao_some_do_geral(self):
        gt_a = [linha(cliente="Ana", valor_total="1.250,00", revisado="sim"),
                linha(cliente="Bruno", valor_total="500,00", revisado="sim")]
        gt_b = [linha(cliente="Carla", valor_total="99,00", revisado="sim")]
        with tempfile.TemporaryDirectory() as tmp:
            gt_dir, ocr_dir = self.preparar(
                tmp,
                {"a.csv": gt_a, "b.csv": gt_b},
                {"a.csv": gt_a},          # só o arquivo "a" tem OCR
            )
            resultados, sem_extracao, _excluidos = eval_mod.avaliar_detalhado(
                gt_dir, ocr_dir, real=True)
        # O arquivo sem OCR aparece no placar geral.
        self.assertEqual({r["arquivo"] for r in resultados}, {"a.csv", "b.csv"})
        b = [r for r in resultados if r["arquivo"] == "b.csv"]
        self.assertTrue(b)
        self.assertTrue(all(not r["presente_ocr"] for r in b))
        # Toda celula com valor no GT conta como erro.
        com_valor = [r for r in b if r["gt"]]
        self.assertTrue(com_valor)
        self.assertTrue(all(r["erro"] == 1 for r in com_valor))
        # E o arquivo fica registrado na secao "sem extracao".
        self.assertEqual(sem_extracao, [("b.csv", 1)])

    def test_relatorio_tem_secao_sem_extracao(self):
        gt_a = [linha(cliente="Ana", revisado="sim")]
        gt_b = [linha(cliente="Bruno", revisado="sim")]
        with tempfile.TemporaryDirectory() as tmp:
            gt_dir, ocr_dir = self.preparar(
                tmp, {"a.csv": gt_a, "b.csv": gt_b}, {"a.csv": gt_a})
            saida = io.StringIO()
            with contextlib.redirect_stdout(saida):
                codigo = eval_mod.executar(gt_dir, ocr_dir, real=True)
        texto = saida.getvalue()
        self.assertEqual(codigo, 0)
        self.assertIn("SEM EXTRACAO", texto)
        self.assertIn("b.csv", texto)
        self.assertIn("1 linha(s)", texto)
        # O geral nao pode ignorar o arquivo sem OCR: as 2 celulas de "a.csv"
        # e as celulas ausentes de "b.csv" entram no placar.
        self.assertIn("GERAL:", texto)

    def test_arquivo_sem_ocr_no_modo_sintetico_tambem_conta(self):
        gt = [linha(cliente="Ana", valor_total="1.250,00")]
        with tempfile.TemporaryDirectory() as tmp:
            gt_dir, ocr_dir = self.preparar(tmp, {"a.csv": gt}, {})
            resultados, sem_extracao, _excluidos = eval_mod.avaliar_detalhado(gt_dir, ocr_dir)
        self.assertTrue(resultados)
        self.assertEqual(sem_extracao, [("a.csv", 1)])


class TestIncertoNoPlacar(BaseEval):
    """Celula marcada como 'incerto' nao altera o placar geral."""

    def test_incerto_nao_entra_no_placar_geral(self):
        gt = [linha(cliente="Ana", valor_total="1.250,00", incerto="valor_total")]
        ocr = [linha(cliente="Ana", valor_total="9.999,99")]
        resultados = self.avaliar(gt, ocr)
        validas = eval_mod._linhas_avaliadas(resultados)
        # A celula incerto fica de fora; o resto da linha continua.
        self.assertNotIn("valor_total", [r["campo"] for r in validas])
        self.assertIn("cliente", [r["campo"] for r in validas])
        # O placar geral fica igual ao de um GT sem a marca "incerto" nos
        # mesmos campos有效 (a taxa nao sobe por causa da celula incerto).
        gt_sem_marca = [linha(cliente="Ana", valor_total="1.250,00")]
        validas_sem_marca = eval_mod._linhas_avaliadas(
            [r for r in self.avaliar(gt_sem_marca, ocr) if r["campo"] == "cliente"])
        self.assertEqual(eval_mod.taxa_erro_ponderada(validas),
                         eval_mod.taxa_erro_ponderada(validas_sem_marca))

    def test_relatorio_do_incerto_mostra_so_contagens(self):
        gt = [linha(cliente="Ana", valor_total="1.250,00", incerto="valor_total",
                    revisado="sim")]
        ocr = [linha(cliente="Ana", valor_total="9.999,99")]
        with tempfile.TemporaryDirectory() as tmp:
            gt_dir = os.path.join(tmp, "gt")
            ocr_dir = os.path.join(tmp, "ocr")
            os.makedirs(gt_dir)
            os.makedirs(ocr_dir)
            self.escrever(gt_dir, "caso.csv", gt)
            self.escrever(ocr_dir, "caso.csv", ocr)
            saida = io.StringIO()
            with contextlib.redirect_stdout(saida):
                eval_mod.executar(gt_dir, ocr_dir, real=True)
        texto = saida.getvalue()
        # So "cliente" tem valor no GT: "valor_total" sai por incerto e as
        # demais 5 colunas estao vazias no GT (saem para a linha de vazias).
        self.assertIn("GERAL: 1 celulas | 1 corretas", texto)
        self.assertIn("CELULAS COM 'incerto' NO GT: 1", texto)
        self.assertIn("preenchida pelo OCR: 1", texto)
        self.assertIn("vazia no OCR: 0", texto)
        self.assertIn("vazias no GT: 5, OCR vazio: 5, OCR preencheu: 0", texto)


class TestPlacarPrincipal(BaseEval):
    """Só célula COM VALOR no GT entra no placar principal (por campo, por
    arquivo e no geral). Célula vazia no GT não conta como acerto."""

    def test_gt_com_celulas_vazias_sem_ocr_da_zero_por_cento(self):
        """GT com células vazias + OCR ausente => 0% no placar principal."""
        # 2 células com valor (cliente, valor_total) e 5 vazias no GT.
        gt = [linha(cliente="Ana", valor_total="1.250,00", revisado="sim")]
        with tempfile.TemporaryDirectory() as tmp:
            gt_dir = os.path.join(tmp, "gt")
            ocr_dir = os.path.join(tmp, "ocr")
            os.makedirs(gt_dir)
            os.makedirs(ocr_dir)
            self.escrever(gt_dir, "caso.csv", gt)
            saida = io.StringIO()
            with contextlib.redirect_stdout(saida):
                codigo = eval_mod.executar(gt_dir, ocr_dir, real=False)
        texto = saida.getvalue()
        self.assertEqual(codigo, 0)
        # Só as 2 células com valor entram — e as duas estão ausentes no OCR.
        self.assertIn("GERAL: 2 celulas | 0 corretas (0.0%)", texto)
        self.assertIn("caso.csv", texto)
        self.assertRegex(texto, r"caso\.csv\s+2\s+0/2 \(0\.0%\)")
        # As vazias saem para a linha própria, sem virar "acerto".
        self.assertIn("vazias no GT: 5, OCR vazio: 5, OCR preencheu: 0", texto)

    def test_celula_vazia_no_gt_nao_conta_como_acerto_nem_erro(self):
        gt = [linha(cliente="Ana")]
        ocr = [linha(cliente="Ana", telefone="85962663254", status="pendente")]
        resultados = self.avaliar(gt, ocr)
        validas = eval_mod._linhas_avaliadas(resultados)
        # So "cliente" tem valor no GT: as 6 vazias ficam fora do placar.
        self.assertEqual([r["campo"] for r in validas], ["cliente"])
        self.assertEqual(sum(1 for r in validas if r["exato"]), 1)
        self.assertEqual(eval_mod.taxa_erro_ponderada(validas), 0.0)
        # 6 vazias no GT: 4 com OCR vazio e 2 preenchidas pelo OCR.
        self.assertEqual(eval_mod.celulas_vazias_no_gt(resultados), (6, 4, 2))

    def test_arquivo_perfeito_continua_100_por_cento(self):
        gt = [linha(cliente="Ana", telefone="85962663254",
                    numero_processo=cnj_numero("0208938"), percentual_exito="20",
                    valor_total="1.250,00", parcela="1/1", status="pendente",
                    revisado="sim")]
        ocr = [dict(gt[0])]
        with tempfile.TemporaryDirectory() as tmp:
            gt_dir = os.path.join(tmp, "gt")
            ocr_dir = os.path.join(tmp, "ocr")
            os.makedirs(gt_dir)
            os.makedirs(ocr_dir)
            self.escrever(gt_dir, "caso.csv", gt)
            self.escrever(ocr_dir, "caso.csv", ocr)
            saida = io.StringIO()
            with contextlib.redirect_stdout(saida):
                codigo = eval_mod.executar(gt_dir, ocr_dir, real=False)
        texto = saida.getvalue()
        self.assertEqual(codigo, 0)
        self.assertIn("GERAL: 7 celulas | 7 corretas (100.0%)", texto)
        self.assertIn("vazias no GT: 0, OCR vazio: 0, OCR preencheu: 0", texto)

    def test_arquivo_sem_ocr_da_zero_por_cento_no_principal(self):
        gt_a = [linha(cliente="Ana", valor_total="1.250,00", revisado="sim")]
        gt_b = [linha(cliente="Bruno", valor_total="500,00", revisado="sim")]
        with tempfile.TemporaryDirectory() as tmp:
            gt_dir = os.path.join(tmp, "gt")
            ocr_dir = os.path.join(tmp, "ocr")
            os.makedirs(gt_dir)
            os.makedirs(ocr_dir)
            self.escrever(gt_dir, "a.csv", gt_a)
            self.escrever(gt_dir, "b.csv", gt_b)
            self.escrever(ocr_dir, "a.csv", gt_a)   # so "a" tem OCR
            saida = io.StringIO()
            with contextlib.redirect_stdout(saida):
                codigo = eval_mod.executar(gt_dir, ocr_dir, real=True)
        texto = saida.getvalue()
        self.assertEqual(codigo, 0)
        self.assertIn("SEM EXTRACAO", texto)
        # O arquivo sem extração aparece com 0% no placar principal.
        self.assertRegex(texto, r"b\.csv\s+\d+\s+0/\d+ \(0\.0%\)")


class TestComparativoRealDashboard(BaseEval):
    """Sessão 6: `secao` fora do comparativo real; rótulos comparados sem
    caixa e sem acento (só na comparação — o OCR continua verbatim)."""

    def comparar(self, gt_linhas, ocr_linhas, real=True):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        gt_dir = os.path.join(tmp.name, "gt")
        ocr_dir = os.path.join(tmp.name, "ocr")
        os.makedirs(gt_dir)
        os.makedirs(ocr_dir)
        self.escrever(gt_dir, "dash.csv", gt_linhas, colunas=COLUNAS_DASHBOARD)
        self.escrever(ocr_dir, "dash.csv", ocr_linhas, colunas=COLUNAS_DASHBOARD)
        return eval_mod.avaliar_detalhado(gt_dir, ocr_dir, real=real)

    def test_secao_fora_do_comparativo_real(self):
        gt = [linha_dashboard(secao="cabecalho", categoria="Entradas",
                              valor="9.876,54", revisado="sim")]
        ocr = [linha_dashboard(secao="", categoria="ENTRADAS", valor="9.876,54")]
        resultados, _sem, excluidos = self.comparar(gt, ocr, real=True)
        campos = [r["campo"] for r in resultados]
        self.assertNotIn("secao", campos)
        self.assertEqual(excluidos, {"secao": 1})
        self.assertEqual(sorted(campos), ["categoria", "detalhe", "valor"])

    def test_sintetico_continua_comparando_secao(self):
        gt = [linha_dashboard(secao="cabecalho", categoria="Entradas",
                              valor="9.876,54")]
        ocr = [linha_dashboard(secao="", categoria="Entradas", valor="9.876,54")]
        resultados, _sem, excluidos = self.comparar(gt, ocr, real=False)
        self.assertIn("secao", [r["campo"] for r in resultados])
        self.assertEqual(excluidos, {})
        secao = [r for r in resultados if r["campo"] == "secao"][0]
        self.assertFalse(secao["exato"])

    def test_rotulo_comparado_sem_caixa_nem_acento_so_na_comparacao(self):
        gt = [linha_dashboard(categoria="Corte Máquina", valor="45,00", revisado="sim")]
        ocr = [linha_dashboard(categoria="CORTE MAQUINA", valor="45,00")]
        resultados, _sem, _exc = self.comparar(gt, ocr, real=True)
        cat = [r for r in resultados if r["campo"] == "categoria"][0]
        # O valor continua verbatim (nada é "arrumado" na comparacao).
        self.assertEqual(cat["gt"], "Corte Máquina")
        self.assertEqual(cat["ocr"], "CORTE MAQUINA")
        self.assertNotEqual(cat["gt"], cat["ocr"])
        # ... mas a comparação ignora caixa e acento: conta como acerto.
        self.assertTrue(cat["exato"])
        self.assertEqual(cat["erro"], 0)

    def test_so_categoria_ignora_caixa_e_acento(self):
        gt = [linha_dashboard(categoria="Entradas", detalhe="Corte Máquina",
                              revisado="sim")]
        ocr = [linha_dashboard(categoria="ENTRADAS", detalhe="CORTE MAQUINA")]
        resultados, _sem, _exc = self.comparar(gt, ocr, real=True)
        por_campo = {r["campo"]: r for r in resultados}
        self.assertTrue(por_campo["categoria"]["exato"])
        # "detalhe" (que não é rótulo do dashboard) continua verbatim.
        self.assertFalse(por_campo["detalhe"]["exato"])

    def test_sem_normalizacao_de_rotulo_no_modo_sintetico(self):
        gt = [linha_dashboard(categoria="Corte Máquina", valor="45,00")]
        ocr = [linha_dashboard(categoria="CORTE MAQUINA", valor="45,00")]
        resultados, _sem, _exc = self.comparar(gt, ocr, real=False)
        cat = [r for r in resultados if r["campo"] == "categoria"][0]
        self.assertFalse(cat["exato"])
        self.assertEqual(cat["erro"], 1)


class TestNormalizadores(unittest.TestCase):
    def test_percentual_11_0_e_11_iguais(self):
        self.assertEqual(eval_mod.normalize_money_prod("11.0"),
                         eval_mod.normalize_money_prod("11"))
        self.assertEqual(eval_mod.normalize_money_prod("11.0"), 11.0)
        self.assertEqual(eval_mod.normalize_money_prod("11"), 11.0)
        self.assertEqual(eval_mod.normalize_money_prod("11,0"), 11.0)

    def test_moeda_rejeita_negativo_e_texto(self):
        self.assertIsNone(eval_mod.normalize_money_prod("-10"))
        self.assertIsNone(eval_mod.normalize_money_prod("abc"))


class TestParidadeTypeScript(unittest.TestCase):
    """Paridade Python x TypeScript.

    O fixture `paridade-normalizadores.json` é gerado pelas funções REAIS do
    backend (`dataset-real/gerar-paridade.ts`). Cada saída do TS é conferida
    contra a porta Python do `eval.py`: divergência = teste falha.
    """

    @classmethod
    def setUpClass(cls):
        if not os.path.exists(FIXTURE_PARIDADE):
            raise AssertionError(
                "fixture de paridade ausente: rode "
                "spikes/ocr-benchmark/node_modules/.bin/tsx "
                "dataset-real/gerar-paridade.ts"
            )
        with open(FIXTURE_PARIDADE, encoding="utf-8") as f:
            cls.fixture = json.load(f)

    def test_fixture_tem_os_quatro_normalizadores(self):
        casos = self.fixture["casos"]
        for nome in ["normalizeMoney", "normalizePhone", "checkCnjCheckDigit",
                     "parseFeeStatus"]:
            self.assertIn(nome, casos)
            self.assertTrue(casos[nome], f"sem casos em {nome}")

    def test_paridade_normalize_money(self):
        divergencias = []
        for caso in self.fixture["casos"]["normalizeMoney"]:
            esperado = caso["saida"]
            obtido = eval_mod.normalize_money_prod(caso["entrada"])
            obtido_json = None if obtido is None else float(obtido)
            esperado_json = None if esperado is None else float(esperado)
            if obtido_json != esperado_json:
                divergencias.append(
                    f'normalizeMoney({caso["entrada"]!r}): TS={esperado_json} x Python={obtido_json}'
                )
        self.assertEqual(divergencias, [], "; ".join(divergencias))

    def test_paridade_normalize_phone(self):
        divergencias = []
        for caso in self.fixture["casos"]["normalizePhone"]:
            esperado = caso["saida"]
            obtido = eval_mod.normalize_phone_prod(caso["entrada"])
            if obtido != esperado:
                divergencias.append(
                    f'normalizePhone({caso["entrada"]!r}): TS={esperado!r} x Python={obtido!r}'
                )
        self.assertEqual(divergencias, [], "; ".join(divergencias))

    def test_paridade_check_cnj_check_digit(self):
        divergencias = []
        for caso in self.fixture["casos"]["checkCnjCheckDigit"]:
            esperado = caso["saida"]
            obtido = eval_mod.check_cnj_check_digit(caso["entrada"])
            if obtido != esperado:
                divergencias.append(
                    f'checkCnjCheckDigit({caso["entrada"]!r}): TS={esperado!r} x Python={obtido!r}'
                )
        self.assertEqual(divergencias, [], "; ".join(divergencias))

    def test_paridade_parse_fee_status(self):
        divergencias = []
        for caso in self.fixture["casos"]["parseFeeStatus"]:
            esperado = caso["saida"]
            obtido = eval_mod.parse_fee_status(caso["entrada"])
            if obtido != esperado:
                divergencias.append(
                    f'parseFeeStatus({caso["entrada"]!r}): TS={esperado!r} x Python={obtido!r}'
                )
        self.assertEqual(divergencias, [], "; ".join(divergencias))

    def test_fixture_cobre_os_casos_obrigatorios(self):
        casos = self.fixture["casos"]
        money = {c["entrada"] for c in casos["normalizeMoney"]}
        for entrada in ["11.0", "11,0", "1.250,00"]:
            self.assertIn(entrada, money)
        phone = {c["entrada"] for c in casos["normalizePhone"]}
        # com e sem DDI
        self.assertTrue(any(e.startswith("55") for e in phone))
        self.assertTrue(any(e.startswith("859") for e in phone))
        cnj = casos["checkCnjCheckDigit"]
        saidas = {c["saida"] for c in cnj}
        self.assertIn("valid", saidas)
        self.assertIn("invalid", saidas)
        self.assertIn("unknown", saidas)
        # status: casos CONHECIDOS (sem aviso) e DESCONHECIDOS (com aviso)
        status = casos["parseFeeStatus"]
        com_aviso = [c for c in status if "warning" in c["saida"]]
        sem_aviso = [c for c in status if "warning" not in c["saida"]]
        self.assertTrue(com_aviso, "sem caso de status desconhecido")
        self.assertTrue(sem_aviso, "sem caso de status conhecido")
        valores = {c["saida"]["value"] for c in sem_aviso}
        self.assertIn("PENDING", valores)
        self.assertIn("PAID", valores)


if __name__ == "__main__":
    unittest.main()
