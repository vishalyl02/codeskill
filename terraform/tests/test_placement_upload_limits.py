"""Check placement upload limits and production WAF deployment (no AWS)."""
import os
from pathlib import Path
import re
import subprocess
from tempfile import TemporaryDirectory
import unittest

ROOT = Path(__file__).resolve().parents[2]


def block(source, marker):
    """Extract one HCL block while ignoring braces inside quoted regex strings."""
    start = source.index('{', source.index(marker))
    depth = 0
    for token in re.finditer(r'"(?:\\.|[^"\\])*"|#[^\n]*|[{}]', source[start:]):
        value = token.group()
        if value == '{':
            depth += 1
        elif value == '}':
            depth -= 1
            if depth == 0:
                return source[start + 1:start + token.start()]
    raise AssertionError('Unclosed HCL block')


class PlacementUploadGatewayTests(unittest.TestCase):
    def setUp(self):
        self.waf = (ROOT / 'terraform/modules/waf/main.tf').read_text()
        exclusions = list(re.finditer(r'\bnot_statement\s*\{', self.waf))
        self.assertEqual(len(exclusions), 2)
        upload_exclusion = block(self.waf[exclusions[1].start():], 'not_statement')
        self.placement = block(upload_exclusion, 'and_statement')
        self.pattern = re.search(r'regex_string\s*=\s*"([^"]+)"', self.placement).group(1)

    def test_exception_matches_only_uuid_document_upload_paths(self):
        uid = '12345678-abcd-ABCD-1234-123456789abc'
        for suffix in ['', '/']:
            self.assertRegex(f'/api/placements/{uid}/documents{suffix}', self.pattern)
        for path in ['/api/placements', f'/api/placements/{uid}',
                     '/api/placements/not-a-uuid/documents',
                     f'/api/placements/{uid}/documents/extra',
                     '/api/submissions', '/api/admin/students',
                     f'/api/placements/{uid}/documents/../other']:
            self.assertNotRegex(path, self.pattern)

    def test_path_and_post_method_are_required_together(self):
        method = block(self.placement, 'byte_match_statement')
        self.assertIn('positional_constraint = "EXACTLY"', method)
        self.assertRegex(method, r'search_string\s*=\s*"POST"')
        self.assertRegex(method, r'field_to_match\s*\{\s*method\s*\{\}')
        self.assertEqual(len(re.findall(r'regex_match_statement\s*\{', self.placement)), 1)
        self.assertEqual(len(re.findall(r'byte_match_statement\s*\{', self.placement)), 1)
        self.assertNotIn('allow {', self.placement)

    def test_other_managed_waf_rules_remain_enabled(self):
        overrides = re.findall(r'rule_action_override\s*\{\s*name\s*=\s*"([^"]+)"', self.waf)
        self.assertEqual(overrides, ['SizeRestrictions_BODY'])
        self.assertIn('awswaf:managed:aws:core-rule-set:SizeRestrictions_Body', self.waf)
        self.assertIn('BlockOversizeBodyOutsideBulkImport', self.waf)

    def test_pdf_bound_and_authorization_remain_in_backend(self):
        service = (ROOT / 'backend-nestjs/src/placements/placements.service.ts').read_text()
        controller = (ROOT / 'backend-nestjs/src/placements/placements.controller.ts').read_text()
        self.assertIn('PDF_LIMIT = 10 * 1024 * 1024', service)
        self.assertRegex(controller, r"@Post\(':id/documents'\)\s*@UseGuards\(AdminGuard\)")
        self.assertIn('@UseGuards(JwtAuthGuard)', controller)
        self.assertIn('fileSize: PDF_LIMIT + 1', controller)
        # The production proxy also needs room for multipart headers.
        for relative in ['terraform/userdata/app.sh.tftpl', 'terraform/modules/asg/main.tf']:
            source = (ROOT / relative).read_text()
            limit = int(re.search(r'client_max_body_size\s+(\d+)M;', source).group(1))
            self.assertGreater(limit * 1024 * 1024, 10 * 1024 * 1024 + 65536)


class ProductionWafDeploymentTests(unittest.TestCase):
    def run_deploy(self, account, state):
        with TemporaryDirectory() as directory:
            bin_dir = Path(directory)
            trace = bin_dir / 'terraform.log'
            aws = bin_dir / 'aws'
            aws.write_text('#!/bin/bash\nprintf "%s\\n" "$TEST_ACCOUNT"\n')
            terraform = bin_dir / 'terraform'
            terraform.write_text(
                '#!/bin/bash\nprintf "%s %s\\n" "$PWD" "$*" >> "$TEST_TRACE"\n'
                'if [[ "$*" == "state list" ]]; then printf "%s\\n" "$TEST_STATE"; fi\n'
            )
            for tool in (aws, terraform):
                tool.chmod(0o700)
            result = subprocess.run(
                ['bash', str(ROOT / 'terraform/scripts/deploy.sh')],
                cwd=directory,
                env={**os.environ, 'PATH': f'{bin_dir}:{os.environ["PATH"]}',
                     'TEST_ACCOUNT': account, 'TEST_STATE': state, 'TEST_TRACE': str(trace)},
                input='NO\n', text=True, capture_output=True, check=False,
            )
            return result, trace.read_text().splitlines() if trace.exists() else []

    def test_plan_uses_production_root_and_existing_state(self):
        result, calls = self.run_deploy('239939507154',
                                        'module.alb.aws_lb.main\nmodule.waf.aws_wafv2_web_acl.main')
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        production = ROOT / 'terraform/environments/production'
        self.assertEqual(calls, [f'{production} {args}' for args in (
            'state list', 'fmt -check -recursive', 'init -backend=false', 'validate',
            'plan -out=production.tfplan',
        )])

    def test_plan_stops_for_wrong_account_or_missing_acl_state(self):
        result, calls = self.run_deploy('000000000000', '')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('Expected CodeSkill production AWS account', result.stderr)
        self.assertEqual(calls, [])

        result, calls = self.run_deploy('239939507154', 'module.alb.aws_lb.main')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('does not contain the production ALB and Web ACL', result.stderr)
        self.assertEqual(len(calls), 1)
        self.assertTrue(calls[0].endswith(' state list'))


if __name__ == '__main__':
    unittest.main()
