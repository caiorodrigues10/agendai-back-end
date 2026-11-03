#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Testes unitários de dataset_core.py (sem rede, sem banco)."""
import re
import unittest
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from dataset_core import (
    dinheiro,
    cnj_dv,
    cnj_numero,
    cnj_valido,
    eh_celular,
    eh_fixo,
    telefone_valido,
    telefone_formatado,
    grep_telefones,
    ORIGEM_CNJ,
)


class TestDinheiro(unittest.TestCase):
    """dinheiro(): milhar com ponto, decimal com vírgula."""

    def test_brasileiro(self):
        self.assertEqual(dinheiro(14786.36), "14.786,36")
        self.assertEqual(dinheiro(1250.0), "1.250,00")
        self.assertEqual(dinheiro(800.5), "800,50")
        self.assertEqual(dinheiro(0.99), "0,99")
        self.assertEqual(dinheiro(0), "0,00")
        self.assertEqual(dinheiro(1234567.89), "1.234.567,89")


class TestCnj(unittest.TestCase):
    """CNJ: DV = 98 - (int(NNNNNNN+AAAA+J+TR+OOOO+"00") % 97), OOOO fixo."""

    def test_dv_conhecido(self):
        # CNJ fictício conhecido, DV calculado à mão:
        # base = 00468682025826010000 ; 98 - (base % 97) = 56
        self.assertEqual(cnj_dv("0046868", "2025", "8", "26", "0100"), 56)

    def test_cnj_valido(self):
        # O CNJ de cadastro-01 (conhecido) e 10 números gerados pelo dataset
        # devem validar todos. Os gerados usam o próprio gerador (DV correto).
        numeros = [
            "0046868-56.2025.8.26.0100",  # conhecido do dataset (cadastro-01)
            cnj_numero("0208938"),
            cnj_numero("0046868"),
            cnj_numero("0210811"),
            cnj_numero("0729120"),
            cnj_numero("0530417"),
            cnj_numero("0658076"),
            cnj_numero("0281787"),
            cnj_numero("0240730"),
            cnj_numero("9999999"),
            cnj_numero("0000001"),
        ]
        self.assertEqual(len(numeros), 11)
        for n in numeros:
            self.assertTrue(cnj_valido(n), f"CNJ inválido: {n}")

    def test_origem_fixa(self):
        # OOOO é a constante ORIGEM_CNJ, nunca derivada do DV.
        self.assertEqual(ORIGEM_CNJ, "0100")
        n = cnj_numero("0046868")
        d = re.sub(r"\D", "", n)  # 20 dígitos: NNNNNNNDDAAAAJTROOOO
        self.assertEqual(d[16:20], ORIGEM_CNJ)

    def test_dv_invalido_rejeitado(self):
        self.assertFalse(cnj_valido("0046868-00.2025.8.26.0100"))


class TestTelefone(unittest.TestCase):
    """Máscara: celular 11 dígitos (DD) 9XXXX-XXXX; fixo 10 dígitos (DD) XXXX-XXXX."""

    def test_celular_11(self):
        self.assertEqual(telefone_formatado("85962663254"), "(85) 96266-3254")
        self.assertTrue(eh_celular("85962663254"))
        self.assertFalse(eh_fixo("85962663254"))
        self.assertTrue(telefone_valido("85962663254"))

    def test_fixo_10(self):
        self.assertEqual(telefone_formatado("8526328043"), "(85) 2632-8043")
        self.assertTrue(eh_fixo("8526328043"))
        self.assertFalse(eh_celular("8526328043"))
        self.assertTrue(telefone_valido("8526328043"))

    def test_fora_do_padrao(self):
        self.assertFalse(telefone_valido("852632804"))   # 9 dígitos
        self.assertFalse(telefone_valido("85263280432"))  # 12 dígitos
        self.assertFalse(eh_celular("8526328043"))  # fixo não é celular
        self.assertFalse(eh_fixo("85962663254"))    # celular não é fixo

    def test_mascara_bruta(self):
        self.assertEqual(telefone_formatado("(11) 98765-4321"), "(11) 98765-4321")
        self.assertEqual(telefone_formatado("11 3333-4444"), "(11) 3333-4444")
        with self.assertRaises(ValueError):
            telefone_formatado("123")


class TestGrePrivacidade(unittest.TestCase):
    """Grep de privacidade: encontra telefones 10 e 11 dígitos no texto."""

    def test_acha_telefones(self):
        texto = ("Ligue para (11) 98765-4321 ou para o fixo 21 3333-4444. "
                 "Não é telefone: 123456789012 (12 dígitos) nem 111 (3 dígitos).")
        achados = grep_telefones(texto)
        digitos = [d for d, _ in achados]
        self.assertIn("11987654321", digitos)
        self.assertIn("2133334444", digitos)
        self.assertNotIn("123456789012", digitos)

    def test_tipos_10_e_11(self):
        texto = "Celular: 85962663254 Fixo: 8526328043"
        achados = dict(grep_telefones(texto))
        self.assertEqual(achados["85962663254"], "celular")
        self.assertEqual(achados["8526328043"], "fixo")


if __name__ == "__main__":
    unittest.main()
