# 프로젝트 방향

TypeSea는 zero-dependency TypeScript 검증 컴파일러입니다. 스키마를 입력받아
최적화된 type guard를 출력합니다.

## 핵심 정체성

핵심 프로젝트는 불변 스키마, 적대적 입력에 안전한 검증, Sea-of-Nodes lowering,
최적화, JIT predicate, standalone AOT source를 소유합니다. 성능 수치는 safe,
unsafe, unchecked, boolean, diagnostic 계약을 구분해 제시합니다.

TypeSea 핵심을 Zod 복제품으로 포지셔닝하지 않습니다. Zod 형태의 entry point는
마이그레이션과 생태계 연동을 위한 호환 facade로 유지합니다.

## 기능 폭보다 안정성

가까운 시기의 작업은 다음을 우선합니다.

- 보안 및 실행 모드 parity 회귀 테스트
- 공개 API와 package export drift 방지
- 성능 하한을 검사하는 재현 가능한 warm benchmark
- Node 20.19, 22, 24 CI
- 제한된 package footprint와 zero runtime dependency
- 명시적인 호환성 근거와 솔직한 미지원 사례

새 스키마 기능은 해당되는 경우 interpreted, compiled, AOT, diagnostic, async,
JSON Schema, fuzzing 동작을 함께 정의해야 합니다.

## 제품 계층

1. **TypeSea core**: 고유 검증 및 컴파일 계약
2. **Zod 호환성**: 지원 등급을 문서화한 소스 마이그레이션·생태계 facade
3. **AOT plugin**: 설정된 런타임 컴파일 호출을 빌드 시점에 치환
4. **SeaFlow**: 사용자와 TypeSea parity test를 위한 스키마 기반 경계·적대 입력 생성
5. **SeaBreeze**: 작은 principal join이 필요한 도구용 고급 arena 추론
6. **SeaCurrent**: 범용 계획과 선택형 profile 기반 TypeSea graph lowering·승격 gate

import 비용이나 의미의 소유권이 다르면 별도 subpath로 분리합니다.

## 비목표

- Zod 비공개 parser 구현 복제
- 효과가 있는 callback을 순수 type guard처럼 컴파일
- 벤치마크 수치를 위해 safe mode 약화
- 빌드나 테스트 편의를 위한 runtime dependency 추가
- 핵심 정확성과 릴리스 근거보다 연구 API를 먼저 전면에 배치
- 전체 방향성 의존성과 target resource 검증 전 profile 기반 변환 적용

## 릴리스 기준

릴리스는 source policy, Perl analyzer, 문서 parity, strict TypeScript, lint, test,
dist policy, 공개 API snapshot, Zod 호환성 검사, 고정 실사용 코퍼스, benchmark
floor, package contents, consumer install smoke test를 통과해야 합니다.
