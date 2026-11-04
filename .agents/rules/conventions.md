# 코드 컨벤션

- 함수는 `function` 선언문 대신 `const name = (...) => { ... };` 형태의 화살표 함수로 작성한다.
- 비동기 함수는 `const name = async (...) => { ... };` 형태로 작성한다.
- 컴포넌트의 Props는 해당 컴포넌트 파일 내부에 `interface`로 정의한다.
- 공용 UI 컴포넌트는 `app/components` 폴더에 작성한다.
- 컴포넌트 모듈은 `export default`로 내보내고 기본 import로 가져온다. 단, 라우트 모듈에서 프레임워크가 요구하는 named export는 유지한다.
