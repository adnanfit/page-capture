jQuery(document).ready(function ($) {
  let capturing = false;
  let capturedCanvas = null;

  // Wait for jsPDF to be available
  if (typeof window.jspdf === "undefined") {
    window.jspdf = window.jsPDF;
  }

  async function smoothScroll(to) {
    window.scrollTo({
      top: to,
      behavior: "auto",
    });
    return new Promise((resolve) => setTimeout(resolve, 100));
  }

  async function captureSection(scrollTop) {
    const canvas = await html2canvas(document.documentElement, {
      scrollY: -scrollTop,
      windowWidth: document.documentElement.clientWidth,
      windowHeight: window.innerHeight,
      width: document.documentElement.clientWidth,
      height: window.innerHeight,
      useCORS: true,
      allowTaint: true,
      logging: false,
      backgroundColor: "#FFFFFF",
      scale: 2, //
      imageTimeout: 0,
      onclone: function (clonedDoc) {
        $(clonedDoc)
          .find(
            "#capture-button, #download-popup, #processing-overlay, .capture-button-inline"
          )
          .remove();

        // Force background colors on elements that might be transparent
        $(clonedDoc)
          .find("*")
          .each(function () {
            const bgcolor = $(this).css("backgroundColor");
            if (bgcolor === "rgba(0, 0, 0, 0)" || bgcolor === "transparent") {
              $(this).css("backgroundColor", "#FFFFFF");
            }
          });
      },
    });
    return canvas;
  }

  async function startCapture(clickedElement) {
    if (capturing) return;
    capturing = true;

    const $clickedButton = $(clickedElement);
    $clickedButton.addClass("capturing");
    $("#capture-button, .capture-button-inline").prop("disabled", true);

    try {
      const originalScrollPos = window.pageYOffset;

      const totalHeight = Math.max(
        document.body.scrollHeight,
        document.documentElement.scrollHeight,
        document.body.offsetHeight,
        document.documentElement.offsetHeight
      );

      const finalCanvas = document.createElement("canvas");
      const ctx = finalCanvas.getContext("2d");

      finalCanvas.width =
        document.documentElement.clientWidth * window.devicePixelRatio;
      finalCanvas.height = totalHeight * window.devicePixelRatio;

      await smoothScroll(0);

      const viewportHeight = window.innerHeight;
      let currentScroll = 0;

      while (currentScroll < totalHeight) {
        const sectionCanvas = await captureSection(currentScroll);

        ctx.drawImage(
          sectionCanvas,
          0,
          currentScroll * window.devicePixelRatio,
          sectionCanvas.width,
          sectionCanvas.height
        );

        currentScroll += viewportHeight;
        if (currentScroll < totalHeight) {
          await smoothScroll(currentScroll);
        }
      }

      window.scrollTo(0, originalScrollPos);

      capturedCanvas = finalCanvas;
      showDownloadPopup();
    } catch (error) {
      console.error("Capture failed:", error);
      alert("Failed to capture page. Please try again.");
    } finally {
      $clickedButton.removeClass("capturing");
      $("#capture-button, .capture-button-inline").prop("disabled", false);
      capturing = false;
    }
  }

  async function convertToPdf() {
    if (!capturedCanvas) {
      alert("No capture available. Please capture the page first.");
      return;
    }

    showProcessingOverlay();

    try {
      const { jsPDF } = window.jspdf;

      // A4 dimensions in mm
      const a4Width = 210;
      const a4Height = 297;

      // Get original dimensions
      const imgWidth = capturedCanvas.width;
      const imgHeight = capturedCanvas.height;

      // Calculate best scale to fit width while maintaining aspect ratio
      const scale = a4Width / imgWidth;
      const scaledHeight = imgHeight * scale;

      // Calculate optimal page height (slightly less than A4 height to avoid tiny splits)
      const pageHeight = a4Height - 20;
      const pageWidth = a4Width - 20;

      // Create PDF
      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
      });

      // Calculate number of pages needed
      const totalPages = Math.ceil(scaledHeight / pageHeight);

      // For each page
      for (let page = 0; page < totalPages; page++) {
        if (page > 0) {
          pdf.addPage();
        }

        // Create temporary canvas for this section
        const tempCanvas = document.createElement("canvas");
        const tempCtx = tempCanvas.getContext("2d");

        // Calculate source and destination dimensions
        const sourceY = (page * pageHeight) / scale;
        const sourceHeight = Math.min(pageHeight / scale, imgHeight - sourceY);

        // Set temp canvas size
        tempCanvas.width = imgWidth;
        tempCanvas.height = sourceHeight;

        // Draw portion of original canvas to temp canvas
        tempCtx.drawImage(
          capturedCanvas,
          0,
          sourceY,
          imgWidth,
          sourceHeight,
          0,
          0,
          imgWidth,
          sourceHeight
        );

        // Convert to image data
        const imgData = tempCanvas.toDataURL("image/jpeg", 1.0);

        // Calculate position to center content
        const xOffset = 10;
        const yOffset = 10;

        // Add image to PDF
        pdf.addImage(
          imgData,
          "JPEG",
          xOffset,
          yOffset,
          pageWidth,
          sourceHeight * scale,
          "",
          "FAST"
        );

        // Clean up
        tempCanvas.remove();
      }

      // Save the PDF
      pdf.save(document.title + "-capture.pdf");
      hideProcessingOverlay();
    } catch (error) {
      console.error("PDF conversion failed:", error);
      alert("Failed to convert to PDF. Please try again.");
      hideProcessingOverlay();
    }
  }

  function showProcessingOverlay() {
    $(`
        <div id="processing-overlay">
          <div class="processing-content">
            <div class="spinner"></div>
            <p>Converting to PDF...</p>
          </div>
        </div>
      `).appendTo("body");
  }

  function hideProcessingOverlay() {
    $("#processing-overlay").fadeOut(function () {
      $(this).remove();
    });
  }

  function showDownloadPopup() {
    $("#download-popup").remove();

    const popup = $(`
        <div id="download-popup">
          <div class="download-content">
            <h3>Capture Complete!</h3>
            <div class="download-buttons">
              <button id="download-png" class="download-btn">Download as PNG</button>
              <button id="download-pdf" class="download-btn">Download as PDF</button>
            </div>
          </div>
        </div>
      `).appendTo("body");

    $("#download-png").click(function () {
      capturedCanvas.toBlob(
        function (blob) {
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.download = (document.title || "page-capture") + ".png";
          link.href = url;
          link.click();
          URL.revokeObjectURL(url);
          popup.fadeOut(function () {
            $(this).remove();
          });
        },
        "image/png",
        1.0
      );
    });

    $("#download-pdf").click(function () {
      convertToPdf();
      popup.fadeOut(function () {
        $(this).remove();
      });
    });

    popup.click(function (e) {
      if ($(e.target).is("#download-popup")) {
        popup.fadeOut(function () {
          $(this).remove();
        });
      }
    });
  }

  $("#capture-button, .capture-button-inline").click(function () {
    startCapture(this);
  });
});
